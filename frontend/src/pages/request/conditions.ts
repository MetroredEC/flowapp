// Evaluación del árbol de decisiones del formulario.
//
// Vive aparte del componente a propósito: es lógica pura, es lo que decide qué
// se pregunta y qué no, y así puede comprobarse sin montar React.

import type { FormField } from '../../lib/api';

export type FieldValue = string | boolean | string[];

/** Una comparación suelta contra la respuesta de otra pregunta. */
export interface VisibleRule { field: string; op?: string; value?: string }

/**
 * Condición completa. Se acepta también el formato antiguo de una sola regla
 * suelta: las condiciones guardadas antes del soporte de Y/O siguen valiendo
 * sin necesidad de reescribirlas.
 */
export interface VisibleIf { match?: 'all' | 'any'; rules?: VisibleRule[] }

/** Texto comparable de cualquier respuesta, para evaluar la condición. */
export function asText(value: FieldValue | undefined): string {
  if (Array.isArray(value)) return value.join(',');
  if (value === true) return 'true';
  if (value === false) return 'false';
  return String(value ?? '');
}

export function ruleHolds(rule: VisibleRule, values: Record<string, FieldValue>): boolean {
  const actual = values[rule.field];
  const expected = rule.value ?? '';
  const text = asText(actual);

  switch (rule.op) {
    case 'neq':          return text !== expected;
    case 'contains':     return text.toLocaleLowerCase('es').includes(expected.toLocaleLowerCase('es'));
    case 'is_empty':     return !text.trim();
    case 'is_not_empty': return Boolean(text.trim());
    default:
      // En selección múltiple basta con que la opción esté marcada.
      return Array.isArray(actual) ? actual.includes(expected) : text === expected;
  }
}

/**
 * Decide si una pregunta aplica según lo ya respondido.
 *
 * Ante una condición ilegible se muestra la pregunta: es preferible pedir un
 * dato de más que ocultar en silencio algo que el proceso necesitaba.
 */
export function fieldApplies(field: FormField, values: Record<string, FieldValue>): boolean {
  if (!field.visible_if_json) return true;

  let parsed: (VisibleIf & VisibleRule) | null = null;
  try { parsed = JSON.parse(field.visible_if_json) as VisibleIf & VisibleRule; } catch { return true; }
  if (!parsed) return true;

  const rules: VisibleRule[] = Array.isArray(parsed.rules)
    ? parsed.rules.filter(rule => rule?.field)
    : parsed.field ? [{ field: parsed.field, op: parsed.op, value: parsed.value }] : [];

  if (rules.length === 0) return true;
  return parsed.match === 'any'
    ? rules.some(rule => ruleHolds(rule, values))
    : rules.every(rule => ruleHolds(rule, values));
}

/** Devuelve el primer error de un conjunto de campos, o null si están bien. */
export function validateFields(
  fields: FormField[], values: Record<string, FieldValue>, files: Record<string, File[]>,
): string | null {
  for (const field of fields) {
    if (!field.required || field.field_type === 'section') continue;
    const value = values[field.field_key];
    if (field.field_type === 'file' && !files[field.field_key]?.length) {
      return `Falta adjuntar un archivo en "${field.label}".`;
    }
    if (field.field_type === 'checkbox' && value !== true) {
      return `Necesitamos que marques "${field.label}".`;
    }
    if (field.field_type === 'checkbox_group' && (!Array.isArray(value) || value.length === 0)) {
      return `Elige al menos una opción en "${field.label}".`;
    }
    if (!['checkbox', 'checkbox_group', 'file'].includes(field.field_type) && !String(value ?? '').trim()) {
      return `Nos falta "${field.label}".`;
    }
  }
  return null;
}

// ─── Ramificación ─────────────────────────────────────────────────────────────
//
// `visible_if_json` responde "¿esta pregunta aplica?"; `branch_json` responde
// "¿a dónde voy después de responderla?". Son complementarios: la visibilidad
// filtra y el salto reordena. Combinados dan árboles de varios niveles sin que
// haya que declarar una condición en cada pregunta intermedia.

export const BRANCH_END = '__end__';

export interface BranchRule { value: string; goto: string }
export interface BranchConfig { rules?: BranchRule[]; default?: string | null }

/**
 * Destino del salto tras responder una pregunta.
 *
 * Gana la primera regla que coincide. En selección múltiple eso significa que
 * el orden de las reglas decide, porque varias opciones marcadas podrían
 * apuntar a sitios distintos y el formulario solo puede ir a uno.
 */
export function resolveBranch(field: FormField, values: Record<string, FieldValue>): string | null {
  if (!field.branch_json) return null;
  let config: BranchConfig | null = null;
  try { config = JSON.parse(field.branch_json) as BranchConfig; } catch { return null; }
  if (!config) return null;

  const answer = values[field.field_key];
  for (const rule of config.rules ?? []) {
    if (!rule?.goto) continue;
    const hit = Array.isArray(answer) ? answer.includes(rule.value) : asText(answer) === rule.value;
    if (hit) return rule.goto;
  }
  return config.default || null;
}

/**
 * Recorrido real de preguntas según lo respondido hasta ahora.
 *
 * Un salto solo puede apuntar hacia adelante. Si apuntara hacia atrás el
 * formulario podría entrar en bucle, y si apunta a una pregunta que ya no
 * existe se ignora en vez de dejar el recorrido colgado.
 */
export function buildPath(
  fields: FormField[], values: Record<string, FieldValue>,
): FormField[] {
  const indexOf = new Map<string, number>();
  fields.forEach((field, index) => indexOf.set(field.field_key, index));

  const path: FormField[] = [];
  let skipUntil: string | null = null;

  for (let index = 0; index < fields.length; index++) {
    const field = fields[index];

    if (skipUntil) {
      if (field.field_key !== skipUntil) continue;
      skipUntil = null;
    }
    if (!fieldApplies(field, values)) continue;
    // Las secciones no son preguntas: solo dan título al paso.
    if (field.field_type !== 'section') path.push(field);

    const target = resolveBranch(field, values);
    if (!target) continue;
    if (target === BRANCH_END) break;

    const targetIndex = indexOf.get(target);
    if (targetIndex === undefined || targetIndex <= index) continue;
    skipUntil = target;
  }

  return path;
}

/**
 * Sección a la que pertenece cada pregunta, según el orden original.
 *
 * Se calcula sobre la lista completa y no sobre el recorrido: si un salto pasa
 * por encima de una cabecera de sección, la pregunta de destino sigue
 * perteneciendo a la suya y el paso conserva su título correcto.
 */
export function sectionOwners(fields: FormField[]): Map<string, FormField> {
  const owners = new Map<string, FormField>();
  let current: FormField | null = null;
  for (const field of fields) {
    if (field.field_type === 'section') { current = field; continue; }
    if (current) owners.set(field.field_key, current);
  }
  return owners;
}
