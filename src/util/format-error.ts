// Thin re-export so command files (which the eslint rule blocks from
// importing src/api/* directly) can still surface Bunny's typed error
// envelope (ErrorKey + Field + status) in user-facing messages.
export { formatBunnyError } from '../api/errors.js';
