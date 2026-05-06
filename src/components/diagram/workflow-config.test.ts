import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { workflowConfig } from './workflow-config.ts'

describe('workflowConfig', () => {
  it('every edge references existing node IDs', () => {
    const nodeIds = new Set(workflowConfig.nodes.map((n) => n.id))
    for (const edge of workflowConfig.edges) {
      assert.ok(
        nodeIds.has(edge.from),
        `edge ${edge.id} has unknown 'from' node ${edge.from}`,
      )
      assert.ok(
        nodeIds.has(edge.to),
        `edge ${edge.id} has unknown 'to' node ${edge.to}`,
      )
    }
  })

  it('every trigger flow references existing node and edge IDs', () => {
    const nodeIds = new Set(workflowConfig.nodes.map((n) => n.id))
    const edgeIds = new Set(workflowConfig.edges.map((e) => e.id))
    for (const flow of workflowConfig.triggerFlows) {
      for (const id of flow.nodes) {
        assert.ok(nodeIds.has(id), `flow ${flow.triggerId}: unknown node ${id}`)
      }
      for (const id of flow.edges) {
        assert.ok(edgeIds.has(id), `flow ${flow.triggerId}: unknown edge ${id}`)
      }
      for (const step of flow.animationSequence) {
        for (const id of step.activeNodes) {
          assert.ok(
            nodeIds.has(id),
            `flow ${flow.triggerId} step ${step.id}: unknown active node ${id}`,
          )
        }
        for (const id of step.activeEdges) {
          assert.ok(
            edgeIds.has(id),
            `flow ${flow.triggerId} step ${step.id}: unknown active edge ${id}`,
          )
        }
      }
    }
  })

  it('defaultTrigger names a real trigger flow', () => {
    const flowIds = new Set(
      workflowConfig.triggerFlows.map((f) => f.triggerId),
    )
    assert.ok(
      flowIds.has(workflowConfig.defaultTrigger),
      `defaultTrigger '${workflowConfig.defaultTrigger}' has no matching flow`,
    )
  })
})
