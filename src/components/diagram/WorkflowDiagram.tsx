import { WorkflowVisualizer } from 'workflow-visualizer'
import { workflowConfig } from './workflow-config.ts'

export default function WorkflowDiagram() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <WorkflowVisualizer config={workflowConfig} />
    </div>
  )
}
