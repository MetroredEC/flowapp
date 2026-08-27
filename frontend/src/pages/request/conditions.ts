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
