/**
 * Mirror of the server's rules, used only for counters, required markers and
 * dropdown options. server/validation/capsuleSchema.js is authoritative and
 * re-checks all of them, so editing this file alone changes nothing the API
 * accepts.
 */
export const CATEGORY_VALUES = ['Coding', 'Writing', 'Research'];
export const USEFULNESS_VALUES = ['Good', 'Needs Improvement'];

export const LIMITS = {
  project_name: 120,
  prompt_title: 120,
  prompt_version: 20,
  prompt_text: 5000,
  response_summary: 2000,
  screenshot_url: 2000,
  notes: 1000,
};

export const REQUIRED_FIELDS = ['project_name', 'prompt_title', 'prompt_text'];

export const EMPTY_CAPSULE = {
  project_name: '',
  prompt_title: '',
  prompt_version: '',
  prompt_text: '',
  response_summary: '',
  category: '',
  usefulness: '',
  reviewed: false,
  improved: false,
  screenshot_url: '',
  notes: '',
};
