import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { api, type ProcessBlueprint } from '../lib/api';

type FieldType = 'text' | 'number' | 'date' | 'textarea' | 'select' | 'checkbox';

type ProposalField = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
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

type Tab = 'summary' | 'form' | 'workflow' | 'publish';

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
    description: 'Compras, presupuesto, despacho y recepción.',
    prompt: 'La supervisora del centro crea una solicitud de suministros. Compras recibe, cotiza y selecciona proveedor. Contabilidad valida presupuesto. Compras despacha. La supervisora recibe, valida cantidades reales y adjunta evidencia.',
  },
  {
    key: 'compras',
    name: 'Compras generales',
    description: 'Revisión, cotización, aprobación y seguimiento.',
    prompt: 'El solicitante crea una solicitud de compra. Compras revisa y cotiza. El responsable aprueba la compra. Compras registra proveedor y fecha estimada. El solicitante recibe confirmación.',
  },
  {
    key: 'marketing',
    name: 'Marketing',
    description: 'Campañas, proveedores, aprobaciones y costos.',
    prompt: 'Marketing solicita una campaña. El responsable revisa objetivo y presupuesto. Compras o proveedor cotiza. Gerencia aprueba. Se ejecuta la campaña y se registra costo final.',
  },
  {
    key: 'mantenimiento',
    name: 'Mantenimiento',
    description: 'Reporte, revisión, ejecución y cierre.',
    prompt: 'Un usuario reporta una necesidad de mantenimiento. Mantenimiento diagnostica. Administración aprueba el gasto si aplica. El técnico ejecuta el trabajo y sube evidencia de cierre.',
  },
];

const FIELD_TYPES: Array<{ value: FieldType; label: string }> = [
  { value: 'text', label: 'Texto' },
  { value: 'textarea', label: 'Texto largo' },
  { value: 'number', label: 'Número' },
  { value: 'date', label: 'Fecha' },
  { value: 'checkbox', label: 'Casilla' },
  { value: 'select', label: 'Lista' },
];

export default function ProcessBuilder() {
  const [blueprints, setBlueprints] = useState<BuilderBlueprint[]>([]);
  const [selected, setSelected] = useState<BuilderBlueprint | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);

  const [name, setName] = useState('Proceso de suministros');
  const [description, setDescription] = useState('Solicitud, revisión, despacho y recepción');
  const [sourceText, setSourceText] = useState(TEMPLATES[0].prompt);
  const [fileName, setFileName] = useState('');

  const [activeTab, setActiveTab] = useState<Tab>('summary');
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
    setActiveTab(parsedSelectedProposal ? 'workflow' : 'summary');
  }, [parsedSelectedProposal]);

  const currentNode = proposal?.nodes[selectedNodeIndex] ?? null;
  const checklist = useMemo(() => getChecklist(proposal), [proposal]);
  const checklistOk = checklist.every(item => item.ok);

  function resetNewProcess() {
    setSelected(null);
    setProposal(null);
    setActiveTab('summary');
    setSelectedNodeIndex(0);
    setName('Proceso de suministros');
    setDescription('Solicitud, revisión, despacho y recepción');
    setSourceText(TEMPLATES[0].prompt);
    setFileName('');
    setMessage('');
    setError('');
  }

  function useTemplate(template: Template) {
    setName(template.name);
    setDescription(template.description);
    setSourceText(template.prompt);
    setSelected(null);
    setProposal(null);
    setActiveTab('summary');
    setMessage('Plantilla cargada. Puedes revisarla antes de continuar.');
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
        return prefix + 'Archivo cargado: ' + file.name + '. Resume aquí el contenido principal.';
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
      setMessage('Estructura preparada. Revisa el recorrido antes de publicar.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo preparar el proceso.');
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
      setError(e instanceof Error ? e.message : 'No se pudieron guardar los cambios.');
    } finally {
      setWorking(false);
    }
  }

  async function publishProcess() {
    if (!selected || !proposal) return;

    if (!checklistOk) {
      setError('Revisa los pendientes antes de publicar.');
      setActiveTab('publish');
      return;
    }

    setWorking(true);
    setError('');
    setMessage('');

    try {
      await api.updateProcessBlueprintProposal(selected.id, proposal);
      await api.deployProcessBlueprint(selected.id);
      await load();
      setMessage('Proceso publicado correctamente.');
      setActiveTab('publish');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo publicar el proceso.');
    } finally {
      setWorking(false);
    }
  }

  function updateProposal(patch: Partial<Proposal>) {
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

  function addNode() {
    setProposal(prev => {
      if (!prev) return prev;

      const node: ProposalNode = {
        id: 'etapa-' + (prev.nodes.length + 1),
        type: 'approval',
        label: 'Nueva etapa',
        description: 'Describe qué debe ocurrir en esta etapa.',
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
          label: 'Evidencia',
        },
      };

      setSelectedNodeIndex(prev.nodes.length);

      return {
        ...prev,
        nodes: [...prev.nodes, node],
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
      <header style={header}>
        <div>
          <div style={eyebrow}>Diseño de procesos</div>
          <h1 style={title}>Procesos</h1>
          <p style={subtitle}>
            Define etapas, responsables, formularios y evidencias en un solo lugar.
          </p>
        </div>

        <button onClick={resetNewProcess} style={primaryButton}>
          Crear proceso
        </button>
      </header>

      {message && <Alert kind="ok">{message}</Alert>}
      {error && <Alert kind="error">{error}</Alert>}

      <div style={workspace}>
        <aside style={sidebar}>
          <div style={panelTitle}>Procesos recientes</div>

          <div style={{ display: 'grid', gap: 8 }}>
            {blueprints.length === 0 && (
              <div style={emptyBox}>Todavía no hay procesos guardados.</div>
            )}

            {blueprints.map(item => (
              <button
                key={item.id}
                onClick={() => {
                  setSelected(item);
                  setMessage('');
                  setError('');
                }}
                style={{
                  ...processItem,
                  ...(selected?.id === item.id ? processItemActive : {}),
                }}
              >
                <span style={{ minWidth: 0 }}>
                  <strong>{item.name}</strong>
                  <small>{item.description || 'Sin descripción'}</small>
                </span>
                <span style={statusStyle(item.status)}>{statusLabel(item.status)}</span>
              </button>
            ))}
          </div>
        </aside>

        <main style={main}>
          {!proposal && (
            <section style={card}>
              <div style={sectionHeader}>
                <div>
                  <h2 style={sectionTitle}>Crear proceso</h2>
                  <p style={sectionSubtitle}>
                    Elige una plantilla o describe cómo trabaja tu equipo.
                  </p>
                </div>
              </div>

              <div style={templateGrid}>
                {TEMPLATES.map(template => (
                  <button
                    key={template.key}
                    onClick={() => useTemplate(template)}
                    style={templateCard}
                  >
                    <strong>{template.name}</strong>
                    <span>{template.description}</span>
                  </button>
                ))}
              </div>

              <div style={formGrid}>
                <Field label="Nombre">
                  <input value={name} onChange={e => setName(e.target.value)} style={input} />
                </Field>

                <Field label="Descripción">
                  <input value={description} onChange={e => setDescription(e.target.value)} style={input} />
                </Field>
              </div>

              <label style={uploadBox}>
                <strong>Cargar documento</strong>
                <span>Archivos de texto, CSV, JSON o Markdown.</span>
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

              <Field label="Descripción del proceso">
                <textarea
                  value={sourceText}
                  onChange={e => setSourceText(e.target.value)}
                  style={{ ...input, minHeight: 220, resize: 'vertical' }}
                />
              </Field>

              <div style={footerActions}>
                <button
                  onClick={createAndAnalyze}
                  disabled={working || !sourceText.trim()}
                  style={primaryButton}
                >
                  {working ? 'Preparando...' : 'Preparar estructura'}
                </button>
              </div>
            </section>
          )}

          {proposal && (
            <section style={card}>
              <div style={sectionHeader}>
                <div>
                  <h2 style={sectionTitle}>{proposal.process_name}</h2>
                  <p style={sectionSubtitle}>
                    Revisa y ajusta el proceso antes de publicarlo.
                  </p>
                </div>

                <div style={topActions}>
                  <button onClick={saveProposal} disabled={working} style={secondaryButton}>
                    Guardar
                  </button>
                  <button onClick={publishProcess} disabled={working} style={primaryButton}>
                    Publicar
                  </button>
                </div>
              </div>

              <nav style={tabs}>
                <TabButton active={activeTab === 'summary'} onClick={() => setActiveTab('summary')}>Resumen</TabButton>
                <TabButton active={activeTab === 'workflow'} onClick={() => setActiveTab('workflow')}>Recorrido</TabButton>
                <TabButton active={activeTab === 'form'} onClick={() => setActiveTab('form')}>Formulario</TabButton>
                <TabButton active={activeTab === 'publish'} onClick={() => setActiveTab('publish')}>Publicación</TabButton>
              </nav>

              {activeTab === 'summary' && (
                <div style={summaryGrid}>
                  <div style={softPanel}>
                    <div style={panelTitle}>Datos generales</div>

                    <div style={formGrid}>
                      <Field label="Nombre del proceso">
                        <input
                          value={proposal.process_name}
                          onChange={e => updateProposal({ process_name: e.target.value })}
                          style={input}
                        />
                      </Field>

                      <Field label="Identificador">
                        <input
                          value={proposal.process_key}
                          onChange={e => updateProposal({ process_key: slug(e.target.value) })}
                          style={input}
                        />
                      </Field>
                    </div>

                    <div style={metricRow}>
                      <Metric label="Etapas" value={String(proposal.nodes.length)} />
                      <Metric label="Formularios" value={String(proposal.nodes.filter(n => (n.form?.fields ?? []).length > 0).length)} />
                      <Metric label="Evidencias" value={String(proposal.nodes.filter(n => n.attachment_rules?.required).length)} />
                    </div>
                  </div>

                  <div style={softPanel}>
                    <div style={panelTitle}>Recorrido</div>
                    <ProcessPath proposal={proposal} onSelect={index => {
                      setSelectedNodeIndex(index);
                      setActiveTab('workflow');
                    }} />
                  </div>
                </div>
              )}

              {activeTab === 'workflow' && (
                <div style={workflowLayout}>
                  <div style={stageList}>
                    <div style={stageListHeader}>
                      <div style={panelTitle}>Etapas</div>
                      <button onClick={addNode} style={smallButton}>Agregar etapa</button>
                    </div>

                    {proposal.nodes.map((node, index) => (
                      <button
                        key={index}
                        onClick={() => setSelectedNodeIndex(index)}
                        style={{
                          ...stageItem,
                          ...(selectedNodeIndex === index ? stageItemActive : {}),
                        }}
                      >
                        <span style={stageNumber}>{index + 1}</span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <strong>{node.label}</strong>
                          <small>{ownerLabel(node)}</small>
                        </span>
                      </button>
                    ))}
                  </div>

                  {currentNode && (
                    <div style={stageEditor}>
                      <div style={editorHeader}>
                        <div>
                          <div style={eyebrow}>Etapa {selectedNodeIndex + 1}</div>
                          <h3 style={editorTitle}>{currentNode.label}</h3>
                        </div>

                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => moveNode(selectedNodeIndex, -1)} style={smallButton}>Subir</button>
                          <button onClick={() => moveNode(selectedNodeIndex, 1)} style={smallButton}>Bajar</button>
                          <button onClick={() => removeNode(selectedNodeIndex)} style={dangerButton}>Eliminar</button>
                        </div>
                      </div>

                      <div style={formGrid}>
                        <Field label="Nombre de la etapa">
                          <input
                            value={currentNode.label}
                            onChange={e => updateNode(selectedNodeIndex, { label: e.target.value })}
                            style={input}
                          />
                        </Field>

                        <Field label="Tipo">
                          <select
                            value={currentNode.type}
                            onChange={e => updateNode(selectedNodeIndex, { type: e.target.value as ProposalNode['type'] })}
                            style={input}
                          >
                            <option value="approval">Aprobación</option>
                            <option value="task">Actividad</option>
                          </select>
                        </Field>
                      </div>

                      <Field label="Qué ocurre en esta etapa">
                        <textarea
                          value={currentNode.description || ''}
                          onChange={e => updateNode(selectedNodeIndex, { description: e.target.value })}
                          style={{ ...input, minHeight: 90, resize: 'vertical' }}
                        />
                      </Field>

                      <div style={formGrid}>
                        <Field label="Responsable">
                          <select
                            value={currentNode.approver_type || 'email'}
                            onChange={e => updateNode(selectedNodeIndex, { approver_type: e.target.value as ProposalNode['approver_type'] })}
                            style={input}
                          >
                            <option value="email">Correo específico</option>
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

                      <div style={formGrid}>
                        <Field label="Nombre de la evidencia">
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

                        <Field label="Archivos mínimos">
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
                      </div>

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
                        Solicitar evidencia en esta etapa
                      </label>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'form' && currentNode && (
                <div style={formDesigner}>
                  <div style={softPanel}>
                    <div style={stageListHeader}>
                      <div>
                        <div style={panelTitle}>Formulario</div>
                        <p style={sectionSubtitle}>Campos que deberá completar el responsable de la etapa seleccionada.</p>
                      </div>

                      <button onClick={() => addField(selectedNodeIndex)} style={smallButton}>Agregar campo</button>
                    </div>

                    <div style={{ display: 'grid', gap: 10 }}>
                      {(currentNode.form?.fields ?? []).map((field, fieldIndex) => (
                        <div key={fieldIndex} style={fieldCard}>
                          <div style={formGrid}>
                            <Field label="Etiqueta">
                              <input
                                value={field.label}
                                onChange={e => updateField(selectedNodeIndex, fieldIndex, { label: e.target.value })}
                                style={input}
                              />
                            </Field>

                            <Field label="Tipo">
                              <select
                                value={field.type}
                                onChange={e => updateField(selectedNodeIndex, fieldIndex, { type: e.target.value as FieldType })}
                                style={input}
                              >
                                {FIELD_TYPES.map(item => (
                                  <option key={item.value} value={item.value}>{item.label}</option>
                                ))}
                              </select>
                            </Field>
                          </div>

                          <div style={formGrid}>
                            <Field label="Identificador">
                              <input
                                value={field.key}
                                onChange={e => updateField(selectedNodeIndex, fieldIndex, { key: slug(e.target.value).replace(/-/g, '_') })}
                                style={input}
                              />
                            </Field>

                            <label style={checkLabel}>
                              <input
                                type="checkbox"
                                checked={Boolean(field.required)}
                                onChange={e => updateField(selectedNodeIndex, fieldIndex, { required: e.target.checked })}
                              />
                              Campo obligatorio
                            </label>
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button onClick={() => removeField(selectedNodeIndex, fieldIndex)} style={dangerButton}>Eliminar campo</button>
                          </div>
                        </div>
                      ))}

                      {(currentNode.form?.fields ?? []).length === 0 && (
                        <div style={emptyBox}>Esta etapa todavía no tiene campos.</div>
                      )}
                    </div>
                  </div>

                  <div style={softPanel}>
                    <div style={panelTitle}>Vista previa</div>
                    <FormPreview node={currentNode} />
                  </div>
                </div>
              )}

              {activeTab === 'publish' && (
                <div style={publishGrid}>
                  <div style={softPanel}>
                    <div style={panelTitle}>Revisión antes de publicar</div>

                    <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                      {checklist.map(item => (
                        <div key={item.label} style={checkItem}>
                          <span style={{ ...checkDot, background: item.ok ? '#12B76A' : '#F79009' }}>
                            {item.ok ? '✓' : '!'}
                          </span>
                          <span>
                            <strong>{item.label}</strong>
                            <small>{item.detail}</small>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={softPanel}>
                    <div style={panelTitle}>Recorrido de una solicitud</div>
                    <div style={{ marginTop: 12 }}>
                      <ProcessPath proposal={proposal} />
                    </div>

                    <div style={footerActions}>
                      <button onClick={publishProcess} disabled={working || !checklistOk} style={primaryButton}>
                        Publicar proceso
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

function ProcessPath({ proposal, onSelect }: { proposal: Proposal; onSelect?: (index: number) => void }) {
  return (
    <div style={path}>
      <div style={pathItem}>
        <span>1</span>
        <strong>Inicio</strong>
        <small>La solicitud se crea</small>
      </div>

      {proposal.nodes.map((node, index) => (
        <button
          key={node.id + index}
          onClick={() => onSelect?.(index)}
          style={pathButton}
        >
          <span>{index + 2}</span>
          <strong>{node.label}</strong>
          <small>{ownerLabel(node)}</small>
        </button>
      ))}

      <div style={pathItem}>
        <span>{proposal.nodes.length + 2}</span>
        <strong>Fin</strong>
        <small>Solicitud cerrada</small>
      </div>
    </div>
  );
}

function FormPreview({ node }: { node: ProposalNode }) {
  const fields = node.form?.fields ?? [];

  return (
    <div style={previewBox}>
      <h3 style={previewTitle}>{node.label}</h3>
      <p style={sectionSubtitle}>{node.description || 'Formulario de la etapa.'}</p>

      <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
        {fields.length === 0 && <div style={emptyBox}>Sin campos configurados.</div>}

        {fields.map(field => (
          <label key={field.key} style={previewField}>
            <span>
              {field.label}
              {field.required && <b style={{ color: '#D92D20' }}> *</b>}
            </span>

            {field.type === 'textarea' ? (
              <textarea disabled style={{ ...input, minHeight: 76 }} placeholder="Respuesta" />
            ) : field.type === 'checkbox' ? (
              <div style={checkLabel}><input type="checkbox" disabled /> Marcar opción</div>
            ) : field.type === 'select' ? (
              <select disabled style={input}><option>Selecciona...</option></select>
            ) : (
              <input disabled type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'} style={input} placeholder="Respuesta" />
            )}
          </label>
        ))}
      </div>

      {node.attachment_rules?.required && (
        <div style={evidenceBox}>
          Evidencia requerida: {node.attachment_rules.label || 'Adjunto'}.
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} style={{ ...tabButton, ...(active ? tabButtonActive : {}) }}>
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 7, fontSize: 12, color: '#344054', fontWeight: 800 }}>
      {label}
      {children}
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={metric}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function Alert({ children, kind }: { children: ReactNode; kind: 'ok' | 'error' }) {
  return (
    <div style={{
      background: kind === 'ok' ? '#ECFDF3' : '#FFF2EC',
      border: '1px solid ' + (kind === 'ok' ? '#ABEFC6' : '#F0997B'),
      color: kind === 'ok' ? '#027A48' : '#993C1D',
      borderRadius: 14,
      padding: 13,
      fontSize: 14,
      fontWeight: 800,
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
  const evidenceValid = nodes.every(node => {
    if (!node.attachment_rules?.required) return true;
    return Boolean(node.attachment_rules.label?.trim()) && Number(node.attachment_rules.min_files ?? 0) > 0;
  });

  return [
    {
      label: 'Etapas configuradas',
      ok: nodes.length > 0,
      detail: nodes.length > 0 ? nodes.length + ' etapa(s)' : 'Agrega al menos una etapa',
    },
    {
      label: 'Nombres completos',
      ok: allNamed,
      detail: allNamed ? 'Todas las etapas tienen nombre' : 'Hay etapas sin nombre',
    },
    {
      label: 'Responsables definidos',
      ok: allOwners,
      detail: allOwners ? 'Todas las etapas tienen responsable' : 'Falta asignar responsables',
    },
    {
      label: 'Formularios completos',
      ok: allFormsValid,
      detail: allFormsValid ? 'Campos completos' : 'Hay campos incompletos',
    },
    {
      label: 'Evidencias correctas',
      ok: evidenceValid,
      detail: evidenceValid ? 'Reglas completas' : 'Corrige evidencias obligatorias',
    },
  ];
}

function ownerLabel(node: ProposalNode): string {
  if (node.approver_type === 'requester') return 'Solicitante';
  if (node.approver_type === 'role') return node.role || 'Rol pendiente';
  return node.approver_email || 'Responsable pendiente';
}

function statusLabel(status: string): string {
  if (status === 'deployed') return 'Publicado';
  if (status === 'analyzed') return 'En edición';
  return 'Borrador';
}

function statusStyle(status: string): CSSProperties {
  return {
    background: status === 'deployed' ? '#ECFDF3' : '#F8FAFC',
    color: status === 'deployed' ? '#027A48' : '#475467',
    border: '1px solid ' + (status === 'deployed' ? '#ABEFC6' : '#EAECF0'),
    borderRadius: 999,
    padding: '4px 9px',
    fontSize: 10,
    fontWeight: 800,
    whiteSpace: 'nowrap',
  };
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60) || 'proceso';
}

const page: CSSProperties = {
  padding: 28,
  display: 'grid',
  gap: 18,
  color: '#101828',
};

const header: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 18,
  alignItems: 'center',
  padding: '24px 26px',
  borderRadius: 28,
  background: 'linear-gradient(135deg, rgba(255,255,255,.92), rgba(255,255,255,.66))',
  border: '1px solid rgba(255,255,255,.82)',
  boxShadow: '0 22px 70px rgba(16,24,40,.08)',
  backdropFilter: 'blur(18px)',
};

const eyebrow: CSSProperties = {
  color: '#185FA5',
  fontSize: 11,
  fontWeight: 900,
  textTransform: 'uppercase',
  letterSpacing: .7,
};

const title: CSSProperties = {
  margin: '4px 0 4px',
  fontSize: 34,
  fontWeight: 900,
  letterSpacing: -0.8,
};

const subtitle: CSSProperties = {
  color: '#667085',
  fontSize: 15,
  lineHeight: 1.45,
};

const workspace: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '300px 1fr',
  gap: 18,
  alignItems: 'start',
};

const sidebar: CSSProperties = {
  position: 'sticky',
  top: 18,
  display: 'grid',
  gap: 14,
  padding: 16,
  borderRadius: 24,
  background: 'rgba(255,255,255,.72)',
  border: '1px solid rgba(255,255,255,.82)',
  boxShadow: '0 16px 50px rgba(16,24,40,.07)',
  backdropFilter: 'blur(18px)',
};

const main: CSSProperties = {
  minWidth: 0,
};

const card: CSSProperties = {
  padding: 22,
  borderRadius: 28,
  background: 'rgba(255,255,255,.82)',
  border: '1px solid rgba(255,255,255,.86)',
  boxShadow: '0 22px 70px rgba(16,24,40,.08)',
  backdropFilter: 'blur(18px)',
};

const sectionHeader: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 16,
  alignItems: 'flex-start',
  marginBottom: 18,
};

const sectionTitle: CSSProperties = {
  fontSize: 23,
  fontWeight: 900,
  margin: 0,
  letterSpacing: -0.3,
};

const sectionSubtitle: CSSProperties = {
  color: '#667085',
  fontSize: 13,
  lineHeight: 1.45,
  margin: '4px 0 0',
};

const panelTitle: CSSProperties = {
  fontSize: 14,
  fontWeight: 900,
  color: '#101828',
};

const templateGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  gap: 12,
  marginBottom: 18,
};

const templateCard: CSSProperties = {
  display: 'grid',
  gap: 6,
  textAlign: 'left',
  padding: 16,
  minHeight: 108,
  borderRadius: 18,
  border: '1px solid #EAECF0',
  background: '#FFFFFF',
  color: '#101828',
  cursor: 'pointer',
  boxShadow: '0 8px 22px rgba(16,24,40,.04)',
};

const formGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 14,
  marginBottom: 14,
};

const input: CSSProperties = {
  width: '100%',
  border: '1px solid #D0D5DD',
  borderRadius: 12,
  padding: '10px 12px',
  font: 'inherit',
  background: '#FFFFFF',
  color: '#101828',
};

const uploadBox: CSSProperties = {
  display: 'grid',
  gap: 4,
  textAlign: 'center',
  padding: 22,
  marginBottom: 14,
  borderRadius: 18,
  border: '1.5px dashed #B2DDFF',
  background: '#F5FAFF',
  color: '#185FA5',
  cursor: 'pointer',
};

const infoBox: CSSProperties = {
  background: '#F8FAFC',
  border: '1px solid #EAECF0',
  borderRadius: 12,
  padding: 11,
  marginBottom: 14,
  fontWeight: 700,
  color: '#344054',
};

const footerActions: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 10,
  marginTop: 18,
};

const topActions: CSSProperties = {
  display: 'flex',
  gap: 10,
  flexWrap: 'wrap',
};

const primaryButton: CSSProperties = {
  background: 'linear-gradient(135deg, #0C447C, #185FA5)',
  color: '#FFFFFF',
  border: '1px solid rgba(255,255,255,.24)',
  borderRadius: 13,
  padding: '10px 15px',
  fontWeight: 800,
  cursor: 'pointer',
  boxShadow: '0 10px 24px rgba(12,68,124,.18)',
};

const secondaryButton: CSSProperties = {
  background: '#FFFFFF',
  color: '#185FA5',
  border: '1px solid #B5D4F4',
  borderRadius: 13,
  padding: '10px 15px',
  fontWeight: 800,
  cursor: 'pointer',
};

const smallButton: CSSProperties = {
  background: '#FFFFFF',
  color: '#185FA5',
  border: '1px solid #B5D4F4',
  borderRadius: 999,
  padding: '7px 10px',
  fontSize: 12,
  fontWeight: 800,
  cursor: 'pointer',
};

const dangerButton: CSSProperties = {
  background: '#FFFFFF',
  color: '#B42318',
  border: '1px solid #FDA29B',
  borderRadius: 999,
  padding: '7px 10px',
  fontSize: 12,
  fontWeight: 800,
  cursor: 'pointer',
};

const tabs: CSSProperties = {
  display: 'flex',
  gap: 4,
  padding: 4,
  marginBottom: 18,
  borderRadius: 14,
  background: '#F2F4F7',
  width: 'fit-content',
};

const tabButton: CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: '#667085',
  borderRadius: 10,
  padding: '8px 13px',
  fontSize: 13,
  fontWeight: 800,
  cursor: 'pointer',
};

const tabButtonActive: CSSProperties = {
  background: '#FFFFFF',
  color: '#0C447C',
  boxShadow: '0 2px 8px rgba(16,24,40,.08)',
};

const processItem: CSSProperties = {
  display: 'flex',
  gap: 10,
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  width: '100%',
  padding: 12,
  borderRadius: 15,
  border: '1px solid #EAECF0',
  background: '#FFFFFF',
  textAlign: 'left',
  cursor: 'pointer',
};

const processItemActive: CSSProperties = {
  border: '1px solid #84CAFF',
  background: '#F5FAFF',
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

const summaryGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 16,
};

const softPanel: CSSProperties = {
  padding: 16,
  borderRadius: 20,
  border: '1px solid #EAECF0',
  background: 'rgba(255,255,255,.76)',
};

const metricRow: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 10,
};

const metric: CSSProperties = {
  display: 'grid',
  gap: 4,
  padding: 14,
  borderRadius: 16,
  background: '#F8FAFC',
  border: '1px solid #EAECF0',
};

const path: CSSProperties = {
  display: 'grid',
  gap: 9,
};

const pathItem: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '32px 1fr',
  columnGap: 10,
  rowGap: 2,
  alignItems: 'center',
  padding: 11,
  borderRadius: 15,
  background: '#F8FAFC',
  border: '1px solid #EAECF0',
};

const pathButton: CSSProperties = {
  ...pathItem,
  width: '100%',
  textAlign: 'left',
  cursor: 'pointer',
};

const workflowLayout: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '330px 1fr',
  gap: 16,
  alignItems: 'start',
};

const stageList: CSSProperties = {
  display: 'grid',
  gap: 9,
};

const stageListHeader: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 10,
  alignItems: 'center',
  marginBottom: 6,
};

const stageItem: CSSProperties = {
  display: 'flex',
  gap: 10,
  alignItems: 'center',
  width: '100%',
  padding: 12,
  borderRadius: 16,
  border: '1px solid #EAECF0',
  background: '#FFFFFF',
  textAlign: 'left',
  cursor: 'pointer',
};

const stageItemActive: CSSProperties = {
  border: '1px solid #84CAFF',
  background: '#F5FAFF',
};

const stageNumber: CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: '50%',
  display: 'grid',
  placeItems: 'center',
  background: '#0C447C',
  color: '#FFFFFF',
  fontWeight: 800,
  flexShrink: 0,
};

const stageEditor: CSSProperties = {
  padding: 16,
  borderRadius: 20,
  border: '1px solid #EAECF0',
  background: '#FFFFFF',
};

const editorHeader: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 14,
  alignItems: 'flex-start',
  marginBottom: 16,
};

const editorTitle: CSSProperties = {
  fontSize: 22,
  fontWeight: 900,
  margin: '3px 0 0',
};

const formDesigner: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1.2fr .8fr',
  gap: 16,
};

const fieldCard: CSSProperties = {
  display: 'grid',
  gap: 10,
  padding: 13,
  borderRadius: 16,
  border: '1px solid #EAECF0',
  background: '#FFFFFF',
};

const checkLabel: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 13,
  fontWeight: 700,
  color: '#344054',
};

const previewBox: CSSProperties = {
  display: 'grid',
  gap: 12,
  marginTop: 12,
};

const previewTitle: CSSProperties = {
  fontSize: 19,
  fontWeight: 900,
  margin: 0,
};

const previewField: CSSProperties = {
  display: 'grid',
  gap: 6,
  fontSize: 12,
  fontWeight: 800,
  color: '#344054',
};

const evidenceBox: CSSProperties = {
  marginTop: 4,
  padding: 12,
  borderRadius: 14,
  background: '#FFFAEB',
  border: '1px solid #FEC84B',
  color: '#93370D',
  fontSize: 12,
  fontWeight: 800,
};

const publishGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 16,
};

const checkItem: CSSProperties = {
  display: 'flex',
  gap: 10,
  alignItems: 'flex-start',
  padding: 11,
  borderRadius: 15,
  background: '#F8FAFC',
  border: '1px solid #EAECF0',
};

const checkDot: CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: '50%',
  display: 'grid',
  placeItems: 'center',
  color: '#FFFFFF',
  fontSize: 12,
  fontWeight: 900,
  flexShrink: 0,
};
