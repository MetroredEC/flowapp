import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { api, type ProcessBlueprint } from '../lib/api';

type FieldType = 'text' | 'number' | 'date' | 'textarea' | 'select' | 'checkbox';

type ProposalField = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  options?: string[];
};

type ProposalNode = {
  id: string;
  type: 'task' | 'approval' | 'start' | 'end';
  label: string;
  description?: string;
  approver_type?: 'email' | 'requester' | 'role';
  approver_email?: string;
  role?: string;
  form?: {
    fields: ProposalField[];
  };
  attachment_rules?: {
    required?: boolean;
    min_files?: number;
    allowed_types?: string[];
    label?: string;
  };
};

type Proposal = {
  process_key: string;
  process_name: string;
  version: number;
  nodes: ProposalNode[];
};

type BuilderBlueprint = ProcessBlueprint & {
  description?: string | null;
  source_text?: string | null;
  proposed_process_json?: string | null;
  status: string;
};

type Template = {
  key: string;
  name: string;
  description: string;
  prompt: string;
};

const TEMPLATES: Template[] = [
  {
    key: 'suministros',
    name: 'Suministros',
    description: 'Compras, presupuesto, despacho, recepcion y evidencia.',
    prompt: 'La supervisora del centro crea una solicitud de suministros. Compras recibe, cotiza y selecciona proveedor. Contabilidad valida presupuesto. Compras despacha. La supervisora recibe, valida cantidades reales y adjunta evidencia.',
  },
  {
    key: 'compras',
    name: 'Compras generales',
    description: 'Solicitud, cotizacion, aprobacion y orden de compra.',
    prompt: 'El solicitante crea una solicitud de compra. Compras revisa y cotiza. El responsable aprueba la compra. Compras registra proveedor y fecha estimada. El solicitante recibe confirmacion.',
  },
  {
    key: 'marketing',
    name: 'Marketing',
    description: 'Campanas, cotizaciones, aprobaciones y registro de costos.',
    prompt: 'Marketing solicita una campana. El responsable revisa objetivo y presupuesto. Compras o proveedor cotiza. Gerencia aprueba. Se ejecuta la campana y se registra costo final.',
  },
  {
    key: 'mantenimiento',
    name: 'Mantenimiento',
    description: 'Reporte, diagnostico, aprobacion y cierre con evidencia.',
    prompt: 'Un usuario reporta una necesidad de mantenimiento. Mantenimiento diagnostica. Administracion aprueba el gasto si aplica. El tecnico ejecuta el trabajo y sube evidencia de cierre.',
  },
  {
    key: 'talento-humano',
    name: 'Talento Humano',
    description: 'Solicitudes internas, revision, aprobacion y registro.',
    prompt: 'Un colaborador solicita apoyo de Talento Humano. Recursos Humanos revisa. Jefatura aprueba si corresponde. Recursos Humanos ejecuta y cierra el caso.',
  },
];

const FIELD_TYPES: Array<{ value: FieldType; label: string }> = [
  { value: 'text', label: 'Texto' },
  { value: 'textarea', label: 'Texto largo' },
  { value: 'number', label: 'Numero' },
  { value: 'date', label: 'Fecha' },
  { value: 'checkbox', label: 'Check' },
  { value: 'select', label: 'Lista' },
];

export default function ProcessBuilder() {
  const [blueprints, setBlueprints] = useState<BuilderBlueprint[]>([]);
  const [selected, setSelected] = useState<BuilderBlueprint | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);

  const [name, setName] = useState('Proceso de suministros');
  const [description, setDescription] = useState('Flujo no-code generado con asistencia IA');
  const [sourceText, setSourceText] = useState(TEMPLATES[0].prompt);
  const [fileName, setFileName] = useState('');

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedNodeIndex, setSelectedNodeIndex] = useState(0);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const res = await api.processBlueprints();
    setBlueprints(res.data as BuilderBlueprint[]);
  }

  useEffect(() => {
    void load();
  }, []);

  const parsedSelectedProposal = useMemo(() => {
    if (!selected?.proposed_process_json) return null;

    try {
      return JSON.parse(selected.proposed_process_json) as Proposal;
    } catch {
      return null;
    }
  }, [selected]);

  useEffect(() => {
    setProposal(parsedSelectedProposal);
    setSelectedNodeIndex(0);
  }, [parsedSelectedProposal]);

  const checklist = useMemo(() => getChecklist(proposal), [proposal]);
  const checklistOk = checklist.every(item => item.ok);
  const currentNode = proposal?.nodes[selectedNodeIndex] ?? null;

  function useTemplate(template: Template) {
    setName(template.name);
    setDescription(template.description);
    setSourceText(template.prompt);
    setSelected(null);
    setProposal(null);
    setStep(1);
    setMessage('Plantilla cargada. Puedes ajustarla antes de generar la propuesta.');
    setError('');
  }

  async function readUploadedFile(file: File) {
    setFileName(file.name);

    const text = await file.text().catch(() => '');

    if (text.trim()) {
      setSourceText(prev => {
        const prefix = prev.trim() ? prev.trim() + '\n\n' : '';
        return prefix + 'Contenido del archivo "' + file.name + '":\n' + text.slice(0, 12000);
      });
    } else {
      setSourceText(prev => {
        const prefix = prev.trim() ? prev.trim() + '\n\n' : '';
        return prefix + 'Archivo cargado: ' + file.name + '. Describe aqui el contenido si el archivo no es texto.';
      });
    }
  }

  async function createAndAnalyze() {
    setWorking(true);
    setError('');
    setMessage('');

    try {
      const created = await api.createProcessBlueprint({
        name,
        description,
        source_text: sourceText,
      });

      await api.analyzeProcessBlueprint(created.data.id);

      const refreshed = await api.processBlueprints();
      const bp = (refreshed.data as BuilderBlueprint[]).find(x => x.id === created.data.id) ?? null;

      setBlueprints(refreshed.data as BuilderBlueprint[]);
      setSelected(bp);
      setStep(2);
      setMessage('Listo. La IA propuso un flujo editable.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo analizar el proceso.');
    } finally {
      setWorking(false);
    }
  }

  async function saveProposal() {
    if (!selected || !proposal) return;

    setWorking(true);
    setError('');
    setMessage('');

    try {
      await api.updateProcessBlueprintProposal(selected.id, proposal);
      await load();
      setMessage('Cambios guardados.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la propuesta.');
    } finally {
      setWorking(false);
    }
  }

  async function deploy() {
    if (!selected || !proposal) return;

    if (!checklistOk) {
      setError('Corrige los pendientes del checklist antes de desplegar.');
      return;
    }

    setWorking(true);
    setError('');
    setMessage('');

    try {
      await api.updateProcessBlueprintProposal(selected.id, proposal);
      await api.deployProcessBlueprint(selected.id);
      await load();
      setMessage('Proceso desplegado. Ya queda disponible para uso.');
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo desplegar el proceso.');
    } finally {
      setWorking(false);
    }
  }

  function updateProcessMeta(patch: Partial<Proposal>) {
    setProposal(prev => prev ? { ...prev, ...patch } : prev);
  }

  function updateNode(index: number, patch: Partial<ProposalNode>) {
    setProposal(prev => {
      if (!prev) return prev;

      return {
        ...prev,
        nodes: prev.nodes.map((node, i) => i === index ? { ...node, ...patch } : node),
      };
    });
  }

  function moveNode(index: number, direction: -1 | 1) {
    setProposal(prev => {
      if (!prev) return prev;

      const target = index + direction;
      if (target < 0 || target >= prev.nodes.length) return prev;

      const nodes = [...prev.nodes];
      const current = nodes[index];
      nodes[index] = nodes[target];
      nodes[target] = current;

      setSelectedNodeIndex(target);

      return {
        ...prev,
        nodes,
      };
    });
  }

  function duplicateNode(index: number) {
    setProposal(prev => {
      if (!prev) return prev;

      const original = prev.nodes[index];
      const copy: ProposalNode = {
        ...original,
        id: slug(original.id + '-copia-' + Date.now().toString().slice(-4)),
        label: original.label + ' copia',
        form: {
          fields: [...(original.form?.fields ?? [])],
        },
        attachment_rules: {
          ...(original.attachment_rules ?? {}),
        },
      };

      const nodes = [...prev.nodes];
      nodes.splice(index + 1, 0, copy);
      setSelectedNodeIndex(index + 1);

      return {
        ...prev,
        nodes,
      };
    });
  }

  function addNode() {
    setProposal(prev => {
      if (!prev) return prev;

      const id = 'paso-' + (prev.nodes.length + 1);

      const next: ProposalNode = {
        id,
        type: 'approval',
        label: 'Nuevo paso',
        description: 'Describe que debe hacer el responsable.',
        approver_type: 'email',
        approver_email: '',
        form: {
          fields: [
            {
              key: 'comentario',
              label: 'Comentario',
              type: 'textarea',
              required: false,
            },
          ],
        },
        attachment_rules: {
          required: false,
          min_files: 0,
          allowed_types: ['pdf', 'jpg', 'png'],
          label: 'Adjuntos',
        },
      };

      setSelectedNodeIndex(prev.nodes.length);

      return {
        ...prev,
        nodes: [...prev.nodes, next],
      };
    });
  }

  function removeNode(index: number) {
    setProposal(prev => {
      if (!prev) return prev;

      const nodes = prev.nodes.filter((_, i) => i !== index);
      setSelectedNodeIndex(Math.max(0, Math.min(index - 1, nodes.length - 1)));

      return {
        ...prev,
        nodes,
      };
    });
  }

  function addField(nodeIndex: number) {
    setProposal(prev => {
      if (!prev) return prev;

      return {
        ...prev,
        nodes: prev.nodes.map((node, i) => {
          if (i !== nodeIndex) return node;

          const fields = node.form?.fields ?? [];

          return {
            ...node,
            form: {
              fields: [
                ...fields,
                {
                  key: 'campo_' + (fields.length + 1),
                  label: 'Nuevo campo',
                  type: 'text',
                  required: false,
                },
              ],
            },
          };
        }),
      };
    });
  }

  function updateField(nodeIndex: number, fieldIndex: number, patch: Partial<ProposalField>) {
    setProposal(prev => {
      if (!prev) return prev;

      return {
        ...prev,
        nodes: prev.nodes.map((node, i) => {
          if (i !== nodeIndex) return node;

          return {
            ...node,
            form: {
              fields: (node.form?.fields ?? []).map((field, j) =>
                j === fieldIndex ? { ...field, ...patch } : field
              ),
            },
          };
        }),
      };
    });
  }

  function removeField(nodeIndex: number, fieldIndex: number) {
    setProposal(prev => {
      if (!prev) return prev;

      return {
        ...prev,
        nodes: prev.nodes.map((node, i) => {
          if (i !== nodeIndex) return node;

          return {
            ...node,
            form: {
              fields: (node.form?.fields ?? []).filter((_, j) => j !== fieldIndex),
            },
          };
        }),
      };
    });
  }

  return (
    <div style={page}>
      <Hero />

      {message && <Alert kind="ok">{message}</Alert>}
      {error && <Alert kind="error">{error}</Alert>}

      <div style={stepper}>
        <StepPill active={step === 1} done={step > 1} number="1" label="Cargar proceso" />
        <StepPill active={step === 2} done={step > 2} number="2" label="Editar y simular" />
        <StepPill active={step === 3} done={false} number="3" label="Desplegar" />
      </div>

      <div style={layout}>
        <aside style={leftPanel}>
          <h2 style={sectionTitle}>Biblioteca</h2>

          <button
            onClick={() => {
              setSelected(null);
              setProposal(null);
              setStep(1);
              setMessage('');
              setError('');
            }}
            style={newButton}
          >
            + Nuevo proceso
          </button>

          <div style={templateTitle}>Plantillas rapidas</div>

          <div style={{ display: 'grid', gap: 9 }}>
            {TEMPLATES.map(template => (
              <button key={template.key} onClick={() => useTemplate(template)} style={templateButton}>
                <strong>{template.name}</strong>
                <span>{template.description}</span>
              </button>
            ))}
          </div>

          <div style={templateTitle}>Procesos guardados</div>

          <div style={{ display: 'grid', gap: 10 }}>
            {blueprints.length === 0 && (
              <div style={emptyBox}>Aun no hay procesos guardados.</div>
            )}

            {blueprints.map(bp => (
              <button
                key={bp.id}
                onClick={() => {
                  setSelected(bp);
                  setStep(bp.proposed_process_json ? 2 : 1);
                  setMessage('');
                  setError('');
                }}
                style={{
                  ...bpButton,
                  ...(selected?.id === bp.id ? bpButtonActive : {}),
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong>{bp.name}</strong>
                  <span style={statusStyle(bp.status)}>{bp.status}</span>
                </div>
                <div style={bpSub}>{bp.description || 'Sin descripcion'}</div>
              </button>
            ))}
          </div>
        </aside>

        <main style={mainPanel}>
          {step === 1 && (
            <section style={glassCard}>
              <div style={cardHeader}>
                <div>
                  <div style={eyebrow}>Paso 1</div>
                  <h2 style={cardTitle}>Carga o describe el proceso</h2>
                  <p style={muted}>
                    Pega el proceso, usa una plantilla o sube un archivo de texto. La IA generara un arbol editable con formularios y adjuntos.
                  </p>
                </div>
              </div>

              <div style={formGrid}>
                <Field label="Nombre del proceso">
                  <input value={name} onChange={e => setName(e.target.value)} style={input} />
                </Field>

                <Field label="Descripcion corta">
                  <input value={description} onChange={e => setDescription(e.target.value)} style={input} />
                </Field>
              </div>

              <label style={dropZone}>
                <div style={{ fontSize: 28, fontWeight: 950, color: '#0C447C' }}>Subir archivo</div>
                <div style={muted}>TXT, CSV, MD, JSON. Si tienes PDF o Word, copia el texto del proceso por ahora.</div>
                <input
                  type="file"
                  accept=".txt,.csv,.md,.json,.log"
                  style={{ display: 'none' }}
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) void readUploadedFile(file);
                    e.target.value = '';
                  }}
                />
              </label>

              {fileName && (
                <div style={infoBox}>Archivo cargado: {fileName}</div>
              )}

              <Field label="Proceso">
                <textarea
                  value={sourceText}
                  onChange={e => setSourceText(e.target.value)}
                  style={{ ...input, minHeight: 240, resize: 'vertical' }}
                />
              </Field>

              <div style={actionsRow}>
                <button onClick={createAndAnalyze} disabled={working || !sourceText.trim()} style={primaryButton}>
                  {working ? 'Analizando...' : 'Generar propuesta IA'}
                </button>
              </div>
            </section>
          )}

          {step === 2 && proposal && (
            <div style={builderGrid}>
              <section style={glassCard}>
                <div style={cardHeader}>
                  <div>
                    <div style={eyebrow}>Paso 2</div>
                    <h2 style={cardTitle}>Arbol de aprobaciones</h2>
                    <p style={muted}>
                      Selecciona un paso para editar responsable, formulario, adjuntos y validaciones.
                    </p>
                  </div>

                  <button onClick={addNode} style={secondaryButton}>
                    + Agregar paso
                  </button>
                </div>

                <div style={processMeta}>
                  <Field label="Nombre visible">
                    <input
                      value={proposal.process_name}
                      onChange={e => updateProcessMeta({ process_name: e.target.value })}
                      style={input}
                    />
                  </Field>

                  <Field label="Codigo interno">
                    <input
                      value={proposal.process_key}
                      onChange={e => updateProcessMeta({ process_key: slug(e.target.value) })}
                      style={input}
                    />
                  </Field>
                </div>

                <div style={flowCanvas}>
                  {proposal.nodes.map((node, index) => (
                    <button
                      key={index}
                      onClick={() => setSelectedNodeIndex(index)}
                      style={{
                        ...flowStep,
                        ...(selectedNodeIndex === index ? flowStepActive : {}),
                      }}
                    >
                      <span style={nodeIndex}>{index + 1}</span>

                      <span style={{ flex: 1, minWidth: 0 }}>
                        <strong>{node.label}</strong>
                        <small>{node.approver_type === 'requester' ? 'Solicitante' : node.approver_email || node.role || 'Sin responsable'}</small>
                      </span>

                      <span style={nodeTypeBadge}>{node.type === 'approval' ? 'Aprobacion' : 'Tarea'}</span>
                    </button>
                  ))}
                </div>

                <div style={actionsRow}>
                  <button onClick={saveProposal} disabled={working} style={secondaryButton}>
                    Guardar
                  </button>

                  <button onClick={deploy} disabled={working || !checklistOk} style={primaryButton}>
                    Desplegar
                  </button>
                </div>
              </section>

              <aside style={sideStack}>
                <ChecklistPanel items={checklist} />
                <SimulationPanel proposal={proposal} />
              </aside>

              {currentNode && (
                <section style={{ ...glassCard, gridColumn: '1 / -1' }}>
                  <div style={cardHeader}>
                    <div>
                      <div style={eyebrow}>Editor visual</div>
                      <h2 style={cardTitle}>Paso {selectedNodeIndex + 1}: {currentNode.label}</h2>
                    </div>

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button onClick={() => moveNode(selectedNodeIndex, -1)} style={tinyButton}>Subir</button>
                      <button onClick={() => moveNode(selectedNodeIndex, 1)} style={tinyButton}>Bajar</button>
                      <button onClick={() => duplicateNode(selectedNodeIndex)} style={tinyButton}>Duplicar</button>
                      <button onClick={() => removeNode(selectedNodeIndex)} style={dangerButton}>Eliminar</button>
                    </div>
                  </div>

                  <div style={editorGrid}>
                    <div style={editorColumn}>
                      <div style={subTitle}>Configuracion del paso</div>

                      <Field label="Nombre del paso">
                        <input
                          value={currentNode.label}
                          onChange={e => updateNode(selectedNodeIndex, { label: e.target.value })}
                          style={input}
                        />
                      </Field>

                      <Field label="ID tecnico">
                        <input
                          value={currentNode.id}
                          onChange={e => updateNode(selectedNodeIndex, { id: slug(e.target.value) })}
                          style={input}
                        />
                      </Field>

                      <Field label="Tipo">
                        <select
                          value={currentNode.type}
                          onChange={e => updateNode(selectedNodeIndex, { type: e.target.value as ProposalNode['type'] })}
                          style={input}
                        >
                          <option value="approval">Aprobacion</option>
                          <option value="task">Tarea operativa</option>
                        </select>
                      </Field>

                      <Field label="Que debe hacer este paso">
                        <textarea
                          value={currentNode.description || ''}
                          onChange={e => updateNode(selectedNodeIndex, { description: e.target.value })}
                          style={{ ...input, minHeight: 96, resize: 'vertical' }}
                        />
                      </Field>

                      <div style={formGrid}>
                        <Field label="Tipo de responsable">
                          <select
                            value={currentNode.approver_type || 'email'}
                            onChange={e => updateNode(selectedNodeIndex, { approver_type: e.target.value as ProposalNode['approver_type'] })}
                            style={input}
                          >
                            <option value="email">Correo fijo</option>
                            <option value="requester">Solicitante</option>
                            <option value="role">Rol</option>
                          </select>
                        </Field>

                        {currentNode.approver_type !== 'requester' && (
                          <Field label={currentNode.approver_type === 'role' ? 'Rol' : 'Correo'}>
                            <input
                              value={currentNode.approver_type === 'role' ? currentNode.role || '' : currentNode.approver_email || ''}
                              onChange={e => {
                                if (currentNode.approver_type === 'role') updateNode(selectedNodeIndex, { role: e.target.value });
                                else updateNode(selectedNodeIndex, { approver_email: e.target.value });
                              }}
                              style={input}
                              placeholder={currentNode.approver_type === 'role' ? 'compras' : 'correo@metrored.med.ec'}
                            />
                          </Field>
                        )}
                      </div>

                      <div style={subTitle}>Adjuntos del paso</div>

                      <Field label="Etiqueta de adjuntos">
                        <input
                          value={currentNode.attachment_rules?.label || ''}
                          onChange={e => updateNode(selectedNodeIndex, {
                            attachment_rules: {
                              ...(currentNode.attachment_rules || {}),
                              label: e.target.value,
                            },
                          })}
                          style={input}
                        />
                      </Field>

                      <div style={formGrid}>
                        <Field label="Minimo de archivos">
                          <input
                            type="number"
                            min="0"
                            value={currentNode.attachment_rules?.min_files ?? 0}
                            onChange={e => updateNode(selectedNodeIndex, {
                              attachment_rules: {
                                ...(currentNode.attachment_rules || {}),
                                min_files: Number(e.target.value || 0),
                              },
                            })}
                            style={input}
                          />
                        </Field>

                        <label style={checkLabel}>
                          <input
                            type="checkbox"
                            checked={Boolean(currentNode.attachment_rules?.required)}
                            onChange={e => updateNode(selectedNodeIndex, {
                              attachment_rules: {
                                ...(currentNode.attachment_rules || {}),
                                required: e.target.checked,
                              },
                            })}
                          />
                          Exigir adjunto
                        </label>
                      </div>
                    </div>

                    <div style={editorColumn}>
                      <div style={subHeader}>
                        <div style={subTitle}>Formulario interactivo</div>
                        <button onClick={() => addField(selectedNodeIndex)} style={tinyButton}>+ Campo</button>
                      </div>

                      <div style={{ display: 'grid', gap: 10 }}>
                        {(currentNode.form?.fields ?? []).map((field, fieldIndex) => (
                          <div key={fieldIndex} style={fieldCard}>
                            <div style={fieldRow}>
                              <input
                                value={field.label}
                                onChange={e => updateField(selectedNodeIndex, fieldIndex, { label: e.target.value })}
                                style={input}
                                placeholder="Etiqueta"
                              />

                              <select
                                value={field.type}
                                onChange={e => updateField(selectedNodeIndex, fieldIndex, { type: e.target.value as FieldType })}
                                style={input}
                              >
                                {FIELD_TYPES.map(item => (
                                  <option key={item.value} value={item.value}>{item.label}</option>
                                ))}
                              </select>
                            </div>

                            <div style={fieldRow}>
                              <input
                                value={field.key}
                                onChange={e => updateField(selectedNodeIndex, fieldIndex, { key: slug(e.target.value).replace(/-/g, '_') })}
                                style={input}
                                placeholder="codigo_campo"
                              />

                              <label style={checkLabel}>
                                <input
                                  type="checkbox"
                                  checked={Boolean(field.required)}
                                  onChange={e => updateField(selectedNodeIndex, fieldIndex, { required: e.target.checked })}
                                />
                                Obligatorio
                              </label>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                              <button onClick={() => removeField(selectedNodeIndex, fieldIndex)} style={dangerTiny}>
                                Quitar campo
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div style={editorColumn}>
                      <div style={subTitle}>Vista previa del formulario</div>
                      <FormPreview node={currentNode} />
                    </div>
                  </div>
                </section>
              )}
            </div>
          )}

          {step === 3 && (
            <section style={glassCard}>
              <div style={{ textAlign: 'center', padding: 40 }}>
                <div style={successIcon}>OK</div>
                <h2 style={cardTitle}>Proceso desplegado</h2>
                <p style={muted}>
                  El proceso ya quedo disponible para conectarse a tipos de solicitud y usarse por usuarios finales.
                </p>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <div style={hero}>
      <div>
        <div style={eyebrow}>No-code BPM</div>
        <h1 style={heroTitle}>Constructor de procesos</h1>
        <p style={heroText}>
          Carga un proceso real, deja que la IA proponga el flujo, personaliza formularios y despliega sin programar.
        </p>
      </div>

      <div style={heroBadge}>
        Corazon de FlowApp
      </div>
    </div>
  );
}

function StepPill({ active, done, number, label }: { active: boolean; done: boolean; number: string; label: string }) {
  return (
    <div style={{
      ...stepPill,
      ...(active ? stepPillActive : {}),
      ...(done ? stepPillDone : {}),
    }}>
      <span style={stepNumber}>{done ? 'OK' : number}</span>
      {label}
    </div>
  );
}

function ChecklistPanel({ items }: { items: Array<{ label: string; ok: boolean; detail: string }> }) {
  const okCount = items.filter(item => item.ok).length;

  return (
    <section style={miniPanel}>
      <div style={miniPanelTitle}>Checklist de despliegue</div>
      <div style={scoreBox}>{okCount}/{items.length} listo</div>

      <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
        {items.map(item => (
          <div key={item.label} style={checkItem}>
            <span style={{ ...checkDot, background: item.ok ? '#12B76A' : '#F79009' }}>
              {item.ok ? 'OK' : '!'}
            </span>

            <span>
              <strong>{item.label}</strong>
              <small>{item.detail}</small>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function SimulationPanel({ proposal }: { proposal: Proposal | null }) {
  return (
    <section style={miniPanel}>
      <div style={miniPanelTitle}>Simulador</div>
      <p style={mutedSmall}>Asi viajara una solicitud cuando el proceso este activo.</p>

      <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
        <SimStep label="Inicio" detail="El usuario crea la solicitud" index={0} />

        {(proposal?.nodes ?? []).map((node, index) => (
          <SimStep
            key={node.id + index}
            index={index + 1}
            label={node.label}
            detail={node.approver_type === 'requester' ? 'Vuelve al solicitante' : node.approver_email || node.role || 'Responsable pendiente'}
          />
        ))}

        <SimStep label="Fin" detail="Proceso cerrado" index={(proposal?.nodes.length ?? 0) + 1} />
      </div>
    </section>
  );
}

function SimStep({ label, detail, index }: { label: string; detail: string; index: number }) {
  return (
    <div style={simStep}>
      <span style={simIndex}>{index + 1}</span>
      <span>
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
    </div>
  );
}

function FormPreview({ node }: { node: ProposalNode }) {
  const fields = node.form?.fields ?? [];

  return (
    <div style={previewBox}>
      <div style={previewTitle}>{node.label}</div>
      <p style={mutedSmall}>{node.description || 'Formulario del paso.'}</p>

      <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
        {fields.length === 0 && (
          <div style={emptyBox}>Este paso no tiene campos.</div>
        )}

        {fields.map(field => (
          <label key={field.key} style={previewField}>
            <span>
              {field.label}
              {field.required && <b style={{ color: '#D92D20' }}> *</b>}
            </span>

            {field.type === 'textarea' ? (
              <textarea disabled style={{ ...input, minHeight: 70 }} placeholder={field.placeholder || 'Respuesta'} />
            ) : field.type === 'checkbox' ? (
              <div style={checkLabel}><input type="checkbox" disabled /> Marcar opcion</div>
            ) : field.type === 'select' ? (
              <select disabled style={input}><option>Selecciona...</option></select>
            ) : (
              <input disabled type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'} style={input} placeholder={field.placeholder || 'Respuesta'} />
            )}
          </label>
        ))}
      </div>

      {node.attachment_rules?.required && (
        <div style={attachmentPreview}>
          Adjuntos requeridos: {node.attachment_rules.label || 'Adjuntos'} ({node.attachment_rules.min_files || 1} minimo)
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 7, fontSize: 12, color: '#344054', fontWeight: 900 }}>
      {label}
      {children}
    </label>
  );
}

function Alert({ children, kind }: { children: ReactNode; kind: 'ok' | 'error' }) {
  return (
    <div style={{
      background: kind === 'ok' ? 'rgba(236,253,243,.92)' : 'rgba(255,242,236,.92)',
      border: '1px solid ' + (kind === 'ok' ? '#72C7A0' : '#F0997B'),
      color: kind === 'ok' ? '#116B48' : '#993C1D',
      borderRadius: 16,
      padding: 14,
      fontSize: 14,
      fontWeight: 900,
      boxShadow: '0 10px 24px rgba(0,0,0,.04)',
    }}>
      {children}
    </div>
  );
}

function getChecklist(proposal: Proposal | null): Array<{ label: string; ok: boolean; detail: string }> {
  const nodes = proposal?.nodes ?? [];

  const allNamed = nodes.length > 0 && nodes.every(node => node.label.trim().length > 0);
  const allOwners = nodes.length > 0 && nodes.every(node =>
    node.approver_type === 'requester' ||
    Boolean(node.approver_email?.trim()) ||
    Boolean(node.role?.trim())
  );
  const allFormsValid = nodes.every(node =>
    (node.form?.fields ?? []).every(field => field.key.trim() && field.label.trim())
  );
  const attachmentsValid = nodes.every(node => {
    if (!node.attachment_rules?.required) return true;
    return Boolean(node.attachment_rules.label?.trim()) && Number(node.attachment_rules.min_files ?? 0) > 0;
  });

  return [
    {
      label: 'Tiene pasos',
      ok: nodes.length > 0,
      detail: nodes.length > 0 ? nodes.length + ' paso(s)' : 'Agrega al menos un paso',
    },
    {
      label: 'Pasos nombrados',
      ok: allNamed,
      detail: allNamed ? 'Todos tienen nombre' : 'Hay pasos sin nombre',
    },
    {
      label: 'Responsables definidos',
      ok: allOwners,
      detail: allOwners ? 'Todos tienen responsable' : 'Falta aprobador o rol',
    },
    {
      label: 'Formularios validos',
      ok: allFormsValid,
      detail: allFormsValid ? 'Campos completos' : 'Hay campos sin etiqueta o codigo',
    },
    {
      label: 'Adjuntos validos',
      ok: attachmentsValid,
      detail: attachmentsValid ? 'Reglas correctas' : 'Corrige adjuntos obligatorios',
    },
  ];
}

function statusStyle(status: string): CSSProperties {
  return {
    background: status === 'deployed' ? '#ECFDF3' : '#FFFAEB',
    color: status === 'deployed' ? '#027A48' : '#93370D',
    borderRadius: 999,
    padding: '4px 9px',
    fontSize: 10,
    fontWeight: 950,
    textTransform: 'uppercase',
  };
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60) || 'paso';
}

const page: CSSProperties = {
  padding: 32,
  display: 'grid',
  gap: 20,
};

const hero: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 20,
  alignItems: 'center',
  padding: 26,
  borderRadius: 24,
  background: 'rgba(255,255,255,.68)',
  border: '1px solid rgba(255,255,255,.72)',
  boxShadow: '0 18px 60px rgba(12,68,124,.10)',
  backdropFilter: 'blur(18px)',
};

const eyebrow: CSSProperties = {
  color: '#185FA5',
  fontSize: 11,
  fontWeight: 950,
  textTransform: 'uppercase',
  letterSpacing: .7,
};

const heroTitle: CSSProperties = {
  margin: '4px 0 6px',
  fontSize: 34,
  fontWeight: 950,
  letterSpacing: -0.8,
};

const heroText: CSSProperties = {
  maxWidth: 760,
  color: '#667085',
  fontSize: 15,
  lineHeight: 1.55,
};

const heroBadge: CSSProperties = {
  background: '#0C447C',
  color: '#fff',
  borderRadius: 999,
  padding: '11px 16px',
  fontSize: 13,
  fontWeight: 900,
  whiteSpace: 'nowrap',
};

const stepper: CSSProperties = {
  display: 'flex',
  gap: 10,
  flexWrap: 'wrap',
};

const stepPill: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 14px',
  borderRadius: 999,
  background: 'rgba(255,255,255,.62)',
  border: '1px solid rgba(255,255,255,.72)',
  color: '#667085',
  fontWeight: 900,
};

const stepPillActive: CSSProperties = {
  color: '#0C447C',
  background: '#EFF8FF',
  border: '1px solid #B2DDFF',
};

const stepPillDone: CSSProperties = {
  color: '#027A48',
  background: '#ECFDF3',
  border: '1px solid #ABEFC6',
};

const stepNumber: CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: '50%',
  display: 'grid',
  placeItems: 'center',
  background: 'rgba(12,68,124,.10)',
  fontSize: 11,
  fontWeight: 950,
};

const layout: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '320px 1fr',
  gap: 20,
  alignItems: 'start',
};

const leftPanel: CSSProperties = {
  position: 'sticky',
  top: 20,
  background: 'rgba(255,255,255,.66)',
  border: '1px solid rgba(255,255,255,.72)',
  borderRadius: 22,
  padding: 16,
  boxShadow: '0 18px 60px rgba(12,68,124,.08)',
  backdropFilter: 'blur(18px)',
};

const mainPanel: CSSProperties = {
  display: 'grid',
  gap: 20,
};

const builderGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) 340px',
  gap: 20,
};

const sideStack: CSSProperties = {
  display: 'grid',
  gap: 16,
  alignSelf: 'start',
};

const glassCard: CSSProperties = {
  background: 'rgba(255,255,255,.72)',
  border: '1px solid rgba(255,255,255,.76)',
  borderRadius: 24,
  padding: 22,
  boxShadow: '0 18px 60px rgba(12,68,124,.10)',
  backdropFilter: 'blur(18px)',
};

const miniPanel: CSSProperties = {
  background: 'rgba(255,255,255,.74)',
  border: '1px solid rgba(255,255,255,.76)',
  borderRadius: 22,
  padding: 18,
  boxShadow: '0 14px 40px rgba(12,68,124,.08)',
};

const miniPanelTitle: CSSProperties = {
  fontSize: 15,
  fontWeight: 950,
  color: '#101828',
};

const sectionTitle: CSSProperties = {
  fontSize: 16,
  fontWeight: 950,
  marginBottom: 12,
};

const templateTitle: CSSProperties = {
  marginTop: 18,
  marginBottom: 10,
  fontSize: 11,
  fontWeight: 950,
  color: '#185FA5',
  textTransform: 'uppercase',
  letterSpacing: .6,
};

const newButton: CSSProperties = {
  width: '100%',
  border: 'none',
  background: '#0C447C',
  color: '#fff',
  borderRadius: 14,
  padding: '12px 14px',
  fontWeight: 950,
  cursor: 'pointer',
};

const templateButton: CSSProperties = {
  width: '100%',
  textAlign: 'left',
  border: '1px solid #D6E8FA',
  background: '#EFF8FF',
  borderRadius: 15,
  padding: 12,
  cursor: 'pointer',
  display: 'grid',
  gap: 4,
  color: '#0C447C',
};

const bpButton: CSSProperties = {
  width: '100%',
  border: '1px solid #EAECF0',
  background: 'rgba(255,255,255,.74)',
  borderRadius: 16,
  padding: 13,
  textAlign: 'left',
  cursor: 'pointer',
};

const bpButtonActive: CSSProperties = {
  border: '1px solid #B2DDFF',
  background: '#EFF8FF',
};

const bpSub: CSSProperties = {
  marginTop: 5,
  color: '#667085',
  fontSize: 12,
  lineHeight: 1.4,
};

const emptyBox: CSSProperties = {
  color: '#667085',
  background: '#F8FAFC',
  border: '1px solid #EAECF0',
  borderRadius: 14,
  padding: 12,
  fontSize: 13,
  fontWeight: 700,
};

const cardHeader: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 16,
  alignItems: 'flex-start',
  marginBottom: 20,
};

const cardTitle: CSSProperties = {
  fontSize: 24,
  fontWeight: 950,
  letterSpacing: -0.4,
  margin: '4px 0 6px',
};

const muted: CSSProperties = {
  color: '#667085',
  fontSize: 14,
  lineHeight: 1.5,
};

const mutedSmall: CSSProperties = {
  color: '#667085',
  fontSize: 12,
  lineHeight: 1.45,
};

const formGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 14,
  marginBottom: 16,
};

const processMeta: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 240px',
  gap: 14,
  marginBottom: 18,
};

const input: CSSProperties = {
  width: '100%',
  border: '1px solid #CBD5E1',
  borderRadius: 12,
  padding: '11px 12px',
  font: 'inherit',
  background: 'rgba(255,255,255,.86)',
};

const dropZone: CSSProperties = {
  display: 'grid',
  placeItems: 'center',
  textAlign: 'center',
  gap: 8,
  padding: 30,
  marginBottom: 18,
  borderRadius: 18,
  border: '1.5px dashed #B2DDFF',
  background: '#EFF8FF',
  cursor: 'pointer',
};

const infoBox: CSSProperties = {
  background: '#F8FAFC',
  border: '1px solid #EAECF0',
  borderRadius: 12,
  padding: 12,
  marginBottom: 14,
  fontWeight: 800,
  color: '#344054',
};

const actionsRow: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 12,
  marginTop: 20,
};

const primaryButton: CSSProperties = {
  background: '#0C447C',
  color: '#fff',
  border: 'none',
  borderRadius: 14,
  padding: '12px 18px',
  fontWeight: 950,
  cursor: 'pointer',
};

const secondaryButton: CSSProperties = {
  background: '#fff',
  color: '#185FA5',
  border: '1px solid #B5D4F4',
  borderRadius: 14,
  padding: '12px 18px',
  fontWeight: 950,
  cursor: 'pointer',
};

const tinyButton: CSSProperties = {
  background: '#EFF8FF',
  color: '#185FA5',
  border: '1px solid #B2DDFF',
  borderRadius: 999,
  padding: '8px 11px',
  fontSize: 12,
  fontWeight: 900,
  cursor: 'pointer',
};

const dangerButton: CSSProperties = {
  background: '#fff',
  color: '#D92D20',
  border: '1px solid #FDA29B',
  borderRadius: 999,
  padding: '8px 11px',
  fontSize: 12,
  fontWeight: 900,
  cursor: 'pointer',
};

const dangerTiny: CSSProperties = {
  background: '#FFF2EC',
  color: '#D92D20',
  border: '1px solid #FDA29B',
  borderRadius: 10,
  padding: '9px 10px',
  fontWeight: 900,
  cursor: 'pointer',
};

const flowCanvas: CSSProperties = {
  display: 'grid',
  gap: 10,
};

const flowStep: CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  textAlign: 'left',
  background: 'rgba(255,255,255,.82)',
  border: '1px solid #EAECF0',
  borderRadius: 18,
  padding: 13,
  cursor: 'pointer',
};

const flowStepActive: CSSProperties = {
  background: '#EFF8FF',
  border: '1px solid #84CAFF',
  boxShadow: '0 12px 28px rgba(24,95,165,.10)',
};

const nodeIndex: CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: '50%',
  background: '#0C447C',
  color: '#fff',
  display: 'grid',
  placeItems: 'center',
  fontWeight: 950,
  flexShrink: 0,
};

const nodeTypeBadge: CSSProperties = {
  background: '#F2F4F7',
  color: '#344054',
  borderRadius: 999,
  padding: '6px 10px',
  fontSize: 11,
  fontWeight: 900,
};

const editorGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1.1fr 1fr',
  gap: 18,
  alignItems: 'start',
};

const editorColumn: CSSProperties = {
  display: 'grid',
  gap: 12,
  background: 'rgba(255,255,255,.62)',
  border: '1px solid #EAECF0',
  borderRadius: 18,
  padding: 16,
};

const subTitle: CSSProperties = {
  fontSize: 14,
  fontWeight: 950,
  color: '#101828',
};

const subHeader: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  alignItems: 'center',
};

const fieldCard: CSSProperties = {
  display: 'grid',
  gap: 10,
  border: '1px solid #EAECF0',
  background: '#fff',
  borderRadius: 14,
  padding: 12,
};

const fieldRow: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 150px',
  gap: 10,
};

const checkLabel: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 13,
  fontWeight: 800,
  color: '#344054',
};

const previewBox: CSSProperties = {
  background: '#fff',
  border: '1px solid #EAECF0',
  borderRadius: 18,
  padding: 16,
};

const previewTitle: CSSProperties = {
  fontSize: 18,
  fontWeight: 950,
  color: '#101828',
};

const previewField: CSSProperties = {
  display: 'grid',
  gap: 6,
  fontSize: 12,
  color: '#344054',
  fontWeight: 900,
};

const attachmentPreview: CSSProperties = {
  marginTop: 14,
  background: '#FFFAEB',
  border: '1px solid #FEC84B',
  color: '#93370D',
  borderRadius: 12,
  padding: 12,
  fontSize: 12,
  fontWeight: 900,
};

const checkItem: CSSProperties = {
  display: 'flex',
  gap: 10,
  alignItems: 'flex-start',
  padding: 10,
  borderRadius: 14,
  background: '#F8FAFC',
  border: '1px solid #EAECF0',
};

const checkDot: CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: '50%',
  display: 'grid',
  placeItems: 'center',
  color: '#fff',
  fontSize: 10,
  fontWeight: 950,
  flexShrink: 0,
};

const scoreBox: CSSProperties = {
  marginTop: 10,
  background: '#EFF8FF',
  color: '#185FA5',
  border: '1px solid #B2DDFF',
  borderRadius: 14,
  padding: 10,
  fontWeight: 950,
  textAlign: 'center',
};

const simStep: CSSProperties = {
  display: 'flex',
  gap: 10,
  alignItems: 'flex-start',
  background: '#fff',
  border: '1px solid #EAECF0',
  borderRadius: 14,
  padding: 10,
};

const simIndex: CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: '50%',
  display: 'grid',
  placeItems: 'center',
  background: '#0C447C',
  color: '#fff',
  fontSize: 11,
  fontWeight: 950,
  flexShrink: 0,
};

const successIcon: CSSProperties = {
  width: 68,
  height: 68,
  borderRadius: '50%',
  display: 'grid',
  placeItems: 'center',
  background: '#ECFDF3',
  color: '#027A48',
  fontWeight: 950,
  margin: '0 auto 18px',
};
