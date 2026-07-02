// Workspace filesystem operations
export * as workspace from './workspace/workspace.js';

// Workspace watcher
export * as watcher from './workspace/watcher.js';

// Config initialization
export { initConfigs } from './config/initConfigs.js';

// Knowledge version history
export * as versionHistory from './knowledge/version_history.js';

// Voice mode (config + TTS)
export * as voice from './voice/voice.js';

// AnkiConnect flashcard service
export * as anki from './anki/service.js';

// Calendar / Tasks (from frontmatter + manual)
export * as tasks from './calendar/repo.js';
export * as taskTypes from './calendar/types.js';
export * as taskScanner from './calendar/frontmatter-scanner.js';

// Knowledge graph
export * as knowledgeGraph from './knowledge/graph/index.js';

// Deep research
export * as research from './research/index.js';
