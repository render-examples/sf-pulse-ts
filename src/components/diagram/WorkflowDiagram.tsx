import { WorkflowVisualizer } from 'workflow-visualizer'
import { workflowConfig } from './workflow-config.ts'

export default function WorkflowDiagram() {
  return (
    <div className="min-h-full bg-[#0a0a0a] text-zinc-100 p-4">
      <WorkflowVisualizer config={workflowConfig} />
    </div>
  )
}
