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

type Tab = 'form' | 'workflow' | 'settings' | 'publish';

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
    description: 'Solicitud, compras, presupuesto, despacho y recepciÃ³n.',
    prompt: 'La supervisora del centro crea una solicitud de suministros. Compras recibe, cotiza y selecciona proveedor. Contabilidad valida presupuesto. Compras despacha. La supervisora recibe, valida cantidades reales y adjunta evidencia.',
  },
  {
    key: 'compras',
    name: 'Compras generales',
    description: 'RevisiÃ³n, cotizaciÃ³n, aprobaciÃ³n y seguimiento.',
    prompt: 'El solicitante crea una solicitud de compra. Compras revisa y cotiza. El responsable aprueba la compra. Compras registra proveedor y fecha estimada. El solicitante recibe confirmaciÃ³n.',
  },
  {
    key: 'marketing',
    name: 'Marketing',
    description: 'CampaÃ±as, aprobaciones, proveedores y costos.',
    prompt: 'Marketing solicita una campaÃ±a. El responsable revisa objetivo y presupuesto. Compras o proveedor cotiza. Gerencia aprueba. Se ejecuta la campaÃ±a y se registra costo final.',
  },
  {
    key: 'mantenimiento',
    name: 'Mantenimiento',
    description: 'Reporte, revisiÃ³n, ejecuciÃ³n y cierre.',
    prompt: 'Un usuario reporta una necesidad de mantenimiento. Mantenimiento diagnostica. AdministraciÃ³n aprueba el gasto si aplica. El tÃ©cnico ejecuta el trabajo y sube evidencia de cierre.',
  },
];

const FIELD_TYPES: Array<{ value: FieldType; label: string }> = [
  { value: 'text', label: 'Texto' },
  { value: 'textarea', label: 'Texto largo' },
  { value: 'number', label: 'NÃºmero' },
  { value: 'date', label: 'Fecha' },
  { value: 'checkbox', label: 'Casilla' },
  { value: 'select', label: 'Lista' },
];

export default function ProcessBuilder() {
  const [blueprints, setBlueprints] = useState<BuilderBlueprint[]>([]);
  const [selected, setSelected] = useState<BuilderBlueprint | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);

  const [activeTab, setActiveTab] = useState<Tab>('form');
  const [selectedNodeIndex, setSelectedNodeIndex] = useState(0);
  const [showCreate, setShowCreate] = useState(false);

  const [name, setName] = useState('Proceso de suministros');
  const [description, setDescription] = useState('Solicitud, revisiÃ³n, despacho y recepciÃ³n');
  const [sourceText, setSourceText] = useState(TEMPLATES[0].prompt);
  const [fileName, setFileName] = useState('');

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
    if (parsedSelectedProposal) setActiveTab('form');
  }, [parsedSelectedProposal]);

  const currentNode = proposal?.nodes[selectedNodeIndex] ?? null;
  const checklist = useMemo(() => getChecklist(proposal), [proposal]);
  const checklistOk = checklist.every(item => item.ok);

  function startNew(template?: Template) {
    const selectedTemplate = template ?? TEMPLATES[0];

    setName(selectedTemplate.name);
    setDescription(selectedTemplate.description);
    setSourceText(selectedTemplate.prompt);
    setFileName('');
    setSelected(null);
    setProposal(null);
    setMessage('');
    setError('');
    setShowCreate(true);
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
        return prefix + 'Archivo cargado: ' + file.name + '. Resume aquÃ­ el contenido principal.';
      });
    }
  }

  async function createProcess() {
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
      setShowCreate(false);
      setMessage('Proceso preparado. Revisa el formulario y el flujo antes de publicarlo.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear el proceso.');
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
        description: 'Describe quÃ© debe ocurrir en esta etapa.',
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

  function moveNodeTo(fromIndex: number, toIndex: number) {
    setProposal(prev => {
      if (!prev) return prev;
      if (fromIndex === toIndex) return prev;
      if (fromIndex < 0 || toIndex < 0) return prev;
      if (fromIndex >= prev.nodes.length || toIndex >= prev.nodes.length) return prev;

      const nodes = [...prev.nodes];
      const [moved] = nodes.splice(fromIndex, 1);
      nodes.splice(toIndex, 0, moved);

      setSelectedNodeIndex(toIndex);

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
          <h1 style={title}>Procesos</h1>
          <p style={subtitle}>Administra formularios, etapas, responsables y publicaciÃ³n.</p>
        </div>

        <button onClick={() => startNew()} style={primaryButton}>
          Nuevo proceso
        </button>
      </header>

      {message && <Alert kind="ok">{message}</Alert>}
      {error && <Alert kind="error">{error}</Alert>}

      <div style={workspace}>
        <aside style={sidebar}>
          <div style={sideSection}>
            <div style={panelTitle}>Procesos</div>

            <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
              {blueprints.length === 0 && (
                <div style={emptyBox}>TodavÃ­a no hay procesos creados.</div>
              )}

              {blueprints.map(item => (
                <button
                  key={item.id}
                  onClick={() => {
                    setSelected(item);
                    setShowCreate(false);
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
                    <small>{item.description || 'Sin descripciÃ³n'}</small>
                  </span>
                  <span style={statusStyle(item.status)}>{statusLabel(item.status)}</span>
                </button>
              ))}
            </div>
          </div>

          <div style={sideSection}>
            <div style={panelTitle}>Plantillas</div>

            <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
              {TEMPLATES.map(template => (
                <button key={template.key} onClick={() => startNew(template)} style={templateItem}>
                  <strong>{template.name}</strong>
                  <small>{template.description}</small>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <main style={main}>
          {showCreate && (
            <section style={card}>
              <div style={sectionHeader}>
                <div>
                  <h2 style={sectionTitle}>Nuevo proceso</h2>
                  <p style={sectionSubtitle}>Completa la informaciÃ³n inicial para preparar la estructura.</p>
                </div>
              </div>

              <div style={formGrid}>
                <Field label="Nombre">
                  <input value={name} onChange={e => setName(e.target.value)} style={input} />
                </Field>

                <Field label="DescripciÃ³n">
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

              <Field label="DescripciÃ³n del proceso">
                <textarea
                  value={sourceText}
                  onChange={e => setSourceText(e.target.value)}
                  style={{ ...input, minHeight: 220, resize: 'vertical' }}
                />
              </Field>

              <div style={footerActions}>
                <button onClick={() => setShowCreate(false)} style={secondaryButton}>
                  Cancelar
                </button>

                <button
                  onClick={createProcess}
                  disabled={working || !sourceText.trim()}
                  style={primaryButton}
                >
                  {working ? 'Preparando...' : 'Preparar proceso'}
                </button>
              </div>
            </section>
          )}

          {!showCreate && !proposal && (
            <section style={emptyState}>
              <div style={emptyStateInner}>
                <h2>Selecciona o crea un proceso</h2>
                <p>Usa una plantilla o crea un proceso nuevo para configurar su formulario y recorrido.</p>
                <button onClick={() => startNew()} style={primaryButton}>Nuevo proceso</button>
              </div>
            </section>
          )}

          {!showCreate && proposal && (
            <section style={card}>
              <div style={sectionHeader}>
                <div>
                  <h2 style={sectionTitle}>{proposal.process_name}</h2>
                  <p style={sectionSubtitle}>Edita el formulario, define el recorrido y publica cuando estÃ© listo.</p>
                </div>

                <div style={topActions}>
                  <button onClick={saveProposal} disabled={working} style={secondaryButton}>Guardar</button>
                  <button onClick={publishProcess} disabled={working} style={primaryButton}>Publicar</button>
                </div>
              </div>

              <nav style={tabs}>
                <TabButton active={activeTab === 'form'} onClick={() => setActiveTab('form')}>Formulario</TabButton>
                <TabButton active={activeTab === 'workflow'} onClick={() => setActiveTab('workflow')}>Flujo</TabButton>
                <TabButton active={activeTab === 'settings'} onClick={() => setActiveTab('settings')}>ConfiguraciÃ³n</TabButton>
                <TabButton active={activeTab === 'publish'} onClick={() => setActiveTab('publish')}>Publicar</TabButton>
              </nav>

              {activeTab === 'form' && currentNode && (
                <div style={twoColumn}>
                  <div style={leftWork}>
                    <div style={toolbar}>
                      <div>
                        <div style={panelTitle}>Etapas</div>
                        <p style={sectionSubtitle}>Selecciona la etapa para editar su formulario.</p>
                      </div>
                      <button onClick={addNode} style={smallButton}>Agregar etapa</button>
                    </div>

                    <StageList
                      nodes={proposal.nodes}
                      selectedIndex={selectedNodeIndex}
                      onSelect={setSelectedNodeIndex}
                      onMove={moveNodeTo}
                    />
                  </div>

                  <div style={rightWork}>
                    <div style={toolbar}>
                      <div>
                        <div style={panelTitle}>Formulario de la etapa</div>
                        <p style={sectionSubtitle}>{currentNode.label}</p>
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
                              Obligatorio
                            </label>
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button onClick={() => removeField(selectedNodeIndex, fieldIndex)} style={dangerButton}>Eliminar campo</button>
                          </div>
                        </div>
                      ))}

                      {(currentNode.form?.fields ?? []).length === 0 && (
                        <div style={emptyBox}>Esta etapa todavÃ­a no tiene campos.</div>
                      )}
                    </div>
                  </div>

                  <div style={previewPanel}>
                    <div style={panelTitle}>Vista previa</div>
                    <FormPreview node={currentNode} />
                  </div>
                </div>
              )}

              {activeTab === 'workflow' && currentNode && (
                <div style={twoColumnWorkflow}>
                  <div style={leftWork}>
                    <div style={toolbar}>
                      <div>
                        <div style={panelTitle}>Flujo</div>
                        <p style={sectionSubtitle}>Orden de atenciÃ³n de la solicitud.</p>
                      </div>
                      <button onClick={addNode} style={smallButton}>Agregar etapa</button>
                    </div>

                    <StageList
                      nodes={proposal.nodes}
                      selectedIndex={selectedNodeIndex}
                      onSelect={setSelectedNodeIndex}
                      onMove={moveNodeTo}
                    />

                    <div style={pathBox}>
                      <ProcessPath proposal={proposal} onSelect={setSelectedNodeIndex}
                    />
                    </div>
                  </div>

                  <div style={rightWork}>
                    <div style={toolbar}>
                      <div>
                        <div style={panelTitle}>Detalle de etapa</div>
                        <p style={sectionSubtitle}>Define responsable, instrucciones y evidencia.</p>
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
                          <option value="approval">AprobaciÃ³n</option>
                          <option value="task">Actividad</option>
                        </select>
                      </Field>
                    </div>

                    <Field label="Instrucciones">
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
                          <option value="email">Correo especÃ­fico</option>
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

                      <Field label="Archivos mÃ­nimos">
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
                </div>
              )}

              {activeTab === 'settings' && (
                <div style={settingsGrid}>
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
                      <Metric label="Campos" value={String(proposal.nodes.reduce((acc, n) => acc + (n.form?.fields ?? []).length, 0))} />
                      <Metric label="Evidencias" value={String(proposal.nodes.filter(n => n.attachment_rules?.required).length)} />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'publish' && (
                <div style={publishGrid}>
                  <div style={softPanel}>
                    <div style={panelTitle}>RevisiÃ³n</div>

                    <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                      {checklist.map(item => (
                        <div key={item.label} style={checkItem}>
                          <span style={{ ...checkDot, background: item.ok ? '#12B76A' : '#F79009' }}>
                            {item.ok ? 'âœ“' : '!'}
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
                    <div style={panelTitle}>Recorrido</div>
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

function StageList({
  nodes,
  selectedIndex,
  onSelect,
  onMove,
}: {
  nodes: ProposalNode[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onMove?: (fromIndex: number, toIndex: number) => void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {nodes.map((node, index) => (
        <button
          key={node.id + index}
          draggable
          onDragStart={() => setDragIndex(index)}
          onDragOver={event => event.preventDefault()}
          onDrop={() => {
            if (dragIndex !== null && onMove) {
              onMove(dragIndex, index);
            }
            setDragIndex(null);
          }}
          onDragEnd={() => setDragIndex(null)}
          onClick={() => onSelect(index)}
          title="Arrastra para cambiar el orden"
          style={{
            ...stageItem,
            ...(selectedIndex === index ? stageItemActive : {}),
            ...(dragIndex === index ? stageItemDragging : {}),
          }}
        >
          <span style={stageGrab}>â‹®â‹®</span>
          <span style={stageNumber}>{index + 1}</span>

          <span style={{ flex: 1, minWidth: 0 }}>
            <strong>{node.label}</strong>
            <small>{ownerLabel(node)}</small>
          </span>
        </button>
      ))}
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
              <div style={checkLabel}><input type="checkbox" disabled /> Marcar opciÃ³n</div>
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
  if (status === 'analyzed') return 'En ediciÃ³n';
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
  padding: 26,
  display: 'grid',
  gap: 16,
  color: '#101828',
};

const header: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 18,
  alignItems: 'center',
};

const title: CSSProperties = {
  margin: 0,
  fontSize: 30,
  fontWeight: 900,
  letterSpacing: -0.6,
};

const subtitle: CSSProperties = {
  color: '#667085',
  fontSize: 14,
  lineHeight: 1.45,
  marginTop: 4,
};

const workspace: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '280px minmax(0, 1fr)',
  gap: 16,
  alignItems: 'start',
};

const sidebar: CSSProperties = {
  display: 'grid',
  gap: 14,
  padding: 14,
  borderRadius: 18,
  background: '#FFFFFF',
  border: '1px solid #EAECF0',
  boxShadow: '0 8px 24px rgba(16,24,40,.05)',
};

const sideSection: CSSProperties = {
  display: 'grid',
};

const main: CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
};

const card: CSSProperties = {
  padding: 20,
  overflow: 'hidden',
  borderRadius: 18,
  background: '#FFFFFF',
  border: '1px solid #EAECF0',
  boxShadow: '0 8px 24px rgba(16,24,40,.05)',
};

const emptyState: CSSProperties = {
  minHeight: 480,
  display: 'grid',
  placeItems: 'center',
  borderRadius: 18,
  background: '#FFFFFF',
  border: '1px solid #EAECF0',
  boxShadow: '0 8px 24px rgba(16,24,40,.05)',
};

const emptyStateInner: CSSProperties = {
  textAlign: 'center',
  maxWidth: 420,
  display: 'grid',
  gap: 12,
  justifyItems: 'center',
};

const sectionHeader: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 16,
  alignItems: 'flex-start',
  marginBottom: 16,
};

const sectionTitle: CSSProperties = {
  fontSize: 22,
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

const formGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 14,
  marginBottom: 14,
};

const input: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  border: '1px solid #D0D5DD',
  borderRadius: 10,
  padding: '10px 12px',
  font: 'inherit',
  background: '#FFFFFF',
  color: '#101828',
};

const uploadBox: CSSProperties = {
  display: 'grid',
  gap: 4,
  textAlign: 'center',
  padding: 20,
  marginBottom: 14,
  borderRadius: 14,
  border: '1.5px dashed #B2DDFF',
  background: '#F5FAFF',
  color: '#185FA5',
  cursor: 'pointer',
};

const infoBox: CSSProperties = {
  background: '#F8FAFC',
  border: '1px solid #EAECF0',
  borderRadius: 10,
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
  background: '#0C447C',
  color: '#FFFFFF',
  border: '1px solid #0C447C',
  borderRadius: 10,
  padding: '10px 15px',
  fontWeight: 800,
  cursor: 'pointer',
};

const secondaryButton: CSSProperties = {
  background: '#FFFFFF',
  color: '#185FA5',
  border: '1px solid #B5D4F4',
  borderRadius: 10,
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
  borderRadius: 12,
  background: '#F2F4F7',
  width: 'fit-content',
};

const tabButton: CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: '#667085',
  borderRadius: 8,
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
  padding: 11,
  borderRadius: 12,
  border: '1px solid #EAECF0',
  background: '#FFFFFF',
  textAlign: 'left',
  cursor: 'pointer',
};

const processItemActive: CSSProperties = {
  border: '1px solid #84CAFF',
  background: '#F5FAFF',
};

const templateItem: CSSProperties = {
  display: 'grid',
  gap: 4,
  width: '100%',
  padding: 11,
  borderRadius: 12,
  border: '1px solid #EAECF0',
  background: '#F8FAFC',
  textAlign: 'left',
  cursor: 'pointer',
  color: '#101828',
};

const emptyBox: CSSProperties = {
  color: '#667085',
  background: '#F8FAFC',
  border: '1px solid #EAECF0',
  borderRadius: 12,
  padding: 12,
  fontSize: 13,
  fontWeight: 700,
};

const twoColumn: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '260px minmax(0, 1fr)',
  gap: 14,
  alignItems: 'start',
};

const twoColumnWorkflow: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '300px minmax(0, 1fr)',
  gap: 14,
  alignItems: 'start',
};

const leftWork: CSSProperties = {
  display: 'grid',
  minWidth: 0,
  gap: 10,
  padding: 14,
  borderRadius: 14,
  border: '1px solid #EAECF0',
  background: '#F8FAFC',
};

const rightWork: CSSProperties = {
  display: 'grid',
  minWidth: 0,
  gap: 12,
  padding: 14,
  borderRadius: 14,
  border: '1px solid #EAECF0',
  background: '#FFFFFF',
};

const previewPanel: CSSProperties = {
  gridColumn: '2 / 3',
  padding: 14,
  borderRadius: 14,
  border: '1px solid #EAECF0',
  background: '#FFFFFF',
};

const toolbar: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 10,
  alignItems: 'flex-start',
  marginBottom: 4,
};

const stageItem: CSSProperties = {
  display: 'flex',
  gap: 10,
  alignItems: 'center',
  width: '100%',
  padding: 10,
  borderRadius: 12,
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
  width: 30,
  height: 30,
  borderRadius: '50%',
  display: 'grid',
  placeItems: 'center',
  background: '#0C447C',
  color: '#FFFFFF',
  fontWeight: 800,
  flexShrink: 0,
};

const pathBox: CSSProperties = {
  marginTop: 10,
};

const path: CSSProperties = {
  display: 'grid',
  gap: 8,
};

const pathItem: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '30px 1fr',
  columnGap: 10,
  rowGap: 2,
  alignItems: 'center',
  padding: 10,
  borderRadius: 12,
  background: '#FFFFFF',
  border: '1px solid #EAECF0',
};

const pathButton: CSSProperties = {
  ...pathItem,
  width: '100%',
  textAlign: 'left',
  cursor: 'pointer',
};

const fieldCard: CSSProperties = {
  display: 'grid',
  gap: 10,
  padding: 12,
  borderRadius: 12,
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
  borderRadius: 12,
  background: '#FFFAEB',
  border: '1px solid #FEC84B',
  color: '#93370D',
  fontSize: 12,
  fontWeight: 800,
};

const settingsGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr',
  gap: 14,
};

const publishGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 14,
};

const softPanel: CSSProperties = {
  padding: 14,
  borderRadius: 14,
  border: '1px solid #EAECF0',
  background: '#FFFFFF',
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
  borderRadius: 12,
  background: '#F8FAFC',
  border: '1px solid #EAECF0',
};

const checkItem: CSSProperties = {
  display: 'flex',
  gap: 10,
  alignItems: 'flex-start',
  padding: 11,
  borderRadius: 12,
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

const stageGrab: CSSProperties = {
  color: '#98A2B3',
  fontWeight: 900,
  letterSpacing: -2,
  cursor: 'grab',
  paddingRight: 2,
  userSelect: 'none',
};

const stageItemDragging: CSSProperties = {
  opacity: 0.55,
  transform: 'scale(.99)',
  border: '1px dashed #185FA5',
};