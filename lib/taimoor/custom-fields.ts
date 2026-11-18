import { CustomFieldDef, CustomFieldEntity } from './types';
import { normalizePhoneToE164 } from './phone';

export interface CustomValidationResult {
  valid: boolean;
  sanitized: Record<string, unknown>;
  errors: { key: string; message: string }[];
}

export function validateCustomFields(
  entity: CustomFieldEntity,
  payload: Record<string, unknown> | undefined | null,
  defs: CustomFieldDef[],
  options: { partial?: boolean } = {}
): CustomValidationResult {
  const input = payload && typeof payload === 'object' ? payload : {};
  const entityDefs = defs.filter((d) => d.entity === entity && !d.hidden);
  const defByKey = new Map(entityDefs.map((d) => [d.key, d]));

  const sanitized: Record<string, unknown> = {};
  const errors: { key: string; message: string }[] = [];

  // Check required fields on full create
  if (!options.partial) {
    for (const def of entityDefs) {
      if (def.required) {
        const val = input[def.key];
        if (val === undefined || val === null || String(val).trim() === '') {
          errors.push({
            key: def.key,
            message: `${def.label_en} (${def.label_ur}) is required`,
          });
        }
      }
    }
  }

  for (const [key, rawValue] of Object.entries(input)) {
    const def = defByKey.get(key);
    if (!def) {
      // Allow forward-compatible extra metadata keys only if defined, or reject unknown keys strictly
      errors.push({
        key,
        message: `Unknown custom field "${key}" for entity "${entity}"`,
      });
      continue;
    }

    if (rawValue === null || rawValue === undefined || rawValue === '') {
      if (def.required && options.partial) {
        errors.push({
          key,
          message: `${def.label_en} cannot be cleared because it is required`,
        });
      }
      continue;
    }

    switch (def.type) {
      case 'text': {
        sanitized[key] = String(rawValue).trim();
        break;
      }
      case 'number':
      case 'money': {
        const numeric =
          typeof rawValue === 'number'
            ? rawValue
            : Number(String(rawValue).replace(/,/g, '').trim());
        if (!Number.isFinite(numeric)) {
          errors.push({
            key,
            message: `${def.label_en} must be a valid number${def.type === 'money' ? ' (PKR)' : ''}`,
          });
        } else if (def.type === 'money' && numeric < 0) {
          errors.push({
            key,
            message: `${def.label_en} (PKR) cannot be negative`,
          });
        } else {
          sanitized[key] = numeric;
        }
        break;
      }
      case 'date': {
        const str = String(rawValue).trim();
        const parsed = Date.parse(str);
        if (Number.isNaN(parsed)) {
          errors.push({
            key,
            message: `${def.label_en} must be a valid ISO date (YYYY-MM-DD)`,
          });
        } else {
          sanitized[key] = str.slice(0, 10);
        }
        break;
      }
      case 'select': {
        const str = String(rawValue).trim();
        if (def.options.length > 0 && !def.options.includes(str)) {
          errors.push({
            key,
            message: `${def.label_en} must be one of: ${def.options.join(', ')}`,
          });
        } else {
          sanitized[key] = str;
        }
        break;
      }
      case 'phone': {
        const norm = normalizePhoneToE164(String(rawValue));
        if (!norm.valid || !norm.e164) {
          errors.push({
            key,
            message: `${def.label_en}: ${norm.error || 'Invalid phone number'}`,
          });
        } else {
          sanitized[key] = norm.e164;
        }
        break;
      }
    }
  }

  return {
    valid: errors.length === 0,
    sanitized,
    errors,
  };
}
