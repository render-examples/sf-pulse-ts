import type { WorkflowConfig } from 'workflow-visualizer'

const STEP_DURATION_MS = 1600
const TRIGGER_STEP_DURATION_MS = 1200

const nodes: WorkflowConfig['nodes'] = [
  {
    id: 'daily-cron',
    label: 'Daily Cron',
    type: 'trigger',
    description: 'Render cron service sf-pulse-daily',
    position: { x: 40, y: 240 },
    details: [
      { label: 'Schedule', value: 'Daily' },
      { label: 'Service', value: 'sf-pulse-daily' },
      { label: 'Mechanism', value: 'Render SDK trigger' },
    ],
  },
  {
    id: 'daily-refresh',
    label: 'daily-refresh',
    type: 'orchestrator',
    description: 'Orchestrates the full pipeline (bin/workflow/daily-refresh.ts)',
    position: { x: 240, y: 240 },
    details: [
      { label: 'Timeout', value: '600s' },
      { label: 'Phases', value: '5 (fetch x 2, LLM, persist, menus)' },
    ],
  },
  {
    id: 'fetch-eater-sf',
    label: 'fetch-eater-sf',
    type: 'task',
    description: 'Fetch Eater SF article list',
    position: { x: 480, y: 60 },
    details: [{ label: 'Source', value: 'eater.com/sf' }],
  },
  {
    id: 'fetch-sfist',
    label: 'fetch-sfist',
    type: 'task',
    description: 'Fetch SFist (regex extractor)',
    position: { x: 480, y: 140 },
    details: [{ label: 'Source', value: 'sfist.com' }],
  },
  {
    id: 'fetch-michelin',
    label: 'fetch-michelin',
    type: 'task',
    description: 'Fetch Michelin Guide SF (regex extractor)',
    position: { x: 480, y: 220 },
    details: [{ label: 'Source', value: 'guide.michelin.com' }],
  },
  {
    id: 'search-restaurants',
    label: 'search-restaurants',
    type: 'task',
    description: 'DuckDuckGo search for new SF restaurants',
    position: { x: 480, y: 300 },
    details: [{ label: 'Source', value: 'DuckDuckGo' }],
  },
  {
    id: 'fetch-funcheap',
    label: 'fetch-funcheap',
    type: 'task',
    description: 'Fetch Funcheap event listings',
    position: { x: 480, y: 380 },
    details: [{ label: 'Source', value: 'sf.funcheap.com' }],
  },
  {
    id: 'fetch-famsf',
    label: 'fetch-famsf',
    type: 'task',
    description: 'Fetch Fine Arts Museums of SF events',
    position: { x: 480, y: 460 },
    details: [{ label: 'Source', value: 'famsf.org' }],
  },
  {
    id: 'fetch-cal-academy',
    label: 'fetch-cal-academy',
    type: 'task',
    description: 'Fetch California Academy of Sciences events',
    position: { x: 480, y: 540 },
    details: [{ label: 'Source', value: 'calacademy.org' }],
  },
  {
    id: 'search-events',
    label: 'search-events',
    type: 'task',
    description: 'DuckDuckGo search for Mission District events',
    position: { x: 480, y: 620 },
    details: [{ label: 'Source', value: 'DuckDuckGo' }],
  },
  {
    id: 'llm-extraction',
    label: 'llm-extraction',
    type: 'task',
    description: 'Extract structured restaurants & events from raw articles',
    position: { x: 760, y: 340 },
    details: [
      { label: 'Provider', value: 'OpenAI or Anthropic (LLM_PROVIDER)' },
      { label: 'Fallback', value: 'regex-only when LLM_API_KEY unset' },
    ],
  },
  {
    id: 'apply-discovered-items',
    label: 'apply-discovered-items',
    type: 'task',
    description: 'Upsert into Postgres, broadcast SSE delta, send push notifications',
    position: { x: 1000, y: 340 },
    details: [{ label: 'Storage', value: 'Postgres (server/storage.ts)' }],
  },
  {
    id: 'discover-menus',
    label: 'discover-menus',
    type: 'task',
    description: 'Discover menu URLs and parse dietary flags',
    position: { x: 1240, y: 340 },
    details: [{ label: 'Parser', value: 'AI dietary-flag extractor' }],
  },
]

const edges: WorkflowConfig['edges'] = [
  { id: 'cron-to-orchestrator', from: 'daily-cron', to: 'daily-refresh' },
  { id: 'orch-eater', from: 'daily-refresh', to: 'fetch-eater-sf' },
  { id: 'orch-sfist', from: 'daily-refresh', to: 'fetch-sfist' },
  { id: 'orch-michelin', from: 'daily-refresh', to: 'fetch-michelin' },
  { id: 'orch-search-r', from: 'daily-refresh', to: 'search-restaurants' },
  { id: 'orch-funcheap', from: 'daily-refresh', to: 'fetch-funcheap' },
  { id: 'orch-famsf', from: 'daily-refresh', to: 'fetch-famsf' },
  { id: 'orch-calacademy', from: 'daily-refresh', to: 'fetch-cal-academy' },
  { id: 'orch-search-e', from: 'daily-refresh', to: 'search-events' },
  { id: 'eater-llm', from: 'fetch-eater-sf', to: 'llm-extraction' },
  { id: 'sfist-llm', from: 'fetch-sfist', to: 'llm-extraction' },
  { id: 'michelin-llm', from: 'fetch-michelin', to: 'llm-extraction' },
  { id: 'search-r-llm', from: 'search-restaurants', to: 'llm-extraction' },
  { id: 'funcheap-llm', from: 'fetch-funcheap', to: 'llm-extraction' },
  { id: 'famsf-llm', from: 'fetch-famsf', to: 'llm-extraction' },
  { id: 'calacademy-llm', from: 'fetch-cal-academy', to: 'llm-extraction' },
  { id: 'search-e-llm', from: 'search-events', to: 'llm-extraction' },
  { id: 'llm-apply', from: 'llm-extraction', to: 'apply-discovered-items' },
  { id: 'apply-menus', from: 'apply-discovered-items', to: 'discover-menus' },
]

export const workflowConfig: WorkflowConfig = {
  title: 'SF Pulse Daily Refresh',
  subtitle: 'Render Workflow that scrapes restaurant openings and Mission events every day',
  defaultTrigger: 'daily-cron',
  nodes,
  edges,
  triggerFlows: [
    {
      triggerId: 'daily-cron',
      nodes: nodes.map((n) => n.id),
      edges: edges.map((e) => e.id),
      animationSequence: [
        {
          id: 'trigger-fires',
          activeNodes: ['daily-cron', 'daily-refresh'],
          activeEdges: ['cron-to-orchestrator'],
          duration: TRIGGER_STEP_DURATION_MS,
          title: 'Cron fires',
          description: 'The daily Render cron triggers the dailyRefresh orchestrator.',
        },
        {
          id: 'phase-1-restaurants',
          activeNodes: [
            'fetch-eater-sf',
            'fetch-sfist',
            'fetch-michelin',
            'search-restaurants',
          ],
          activeEdges: ['orch-eater', 'orch-sfist', 'orch-michelin', 'orch-search-r'],
          duration: STEP_DURATION_MS,
          title: 'Phase 1: fetch restaurant sources',
          description:
            'Four fetchers run in parallel via Promise.allSettled (daily-refresh.ts:43-48).',
        },
        {
          id: 'phase-2-events',
          activeNodes: [
            'fetch-funcheap',
            'fetch-famsf',
            'fetch-cal-academy',
            'search-events',
          ],
          activeEdges: [
            'orch-funcheap',
            'orch-famsf',
            'orch-calacademy',
            'orch-search-e',
          ],
          duration: STEP_DURATION_MS,
          title: 'Phase 2: fetch event sources',
          description:
            'Four event fetchers run in parallel (daily-refresh.ts:60-66).',
        },
        {
          id: 'phase-3-llm',
          activeNodes: ['llm-extraction'],
          activeEdges: [
            'eater-llm',
            'sfist-llm',
            'michelin-llm',
            'search-r-llm',
            'funcheap-llm',
            'famsf-llm',
            'calacademy-llm',
            'search-e-llm',
          ],
          duration: STEP_DURATION_MS,
          title: 'Phase 3: LLM extraction',
          description:
            'Raw articles are converted to structured restaurants and events (daily-refresh.ts:89-118).',
        },
        {
          id: 'phase-4-5-persist-menus',
          activeNodes: ['apply-discovered-items', 'discover-menus'],
          activeEdges: ['llm-apply', 'apply-menus'],
          duration: STEP_DURATION_MS,
          title: 'Phases 4 & 5: persist & menu discovery',
          description:
            'Upsert into Postgres, broadcast SSE deltas, send push notifications, then crawl menus (daily-refresh.ts:135-143).',
        },
      ],
    },
  ],
}
