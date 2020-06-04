import { NAME_LENGTH_HARD_LIMIT, NAME_LENGTH_MIN, NAME_LENGTH_SOFT_LIMIT } from '../constants';

export interface IValidationResult {
  valid: 'success' | 'warning' | 'error';
  reason?: string;
}

export function validateName(input: string): IValidationResult {
  if (input.length < NAME_LENGTH_MIN) {
    return {
      valid: 'error',
      reason: 'Name too short',
    };
  } else if (input.length > NAME_LENGTH_HARD_LIMIT) {
    return {
      valid: 'error',
      reason: 'Name too long',
    };
  } else if (input.length > NAME_LENGTH_SOFT_LIMIT) {
    return {
      valid: 'warning',
      reason: 'Long names may get truncated on the website or simply not look good. '
            + 'Please consider a "snappier" name. '
            + 'Keep in mind that the name of the game will always be displayed alongside '
            + 'the collection name automatically and that you will be able to add tags to '
            + 'describe the content.',
    };
  } else {
    return { valid: 'success' };
  }
}
