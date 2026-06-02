export function buildMatrix(config) {
  const matrix = [];
  const breakpoints = config.breakpoints ?? [];
  for (const page of config.pages ?? []) {
    for (const bp of breakpoints) {
      matrix.push({ kind: "page", page: page.name, bp: bp.name });
      for (const comp of page.components ?? []) {
        const states = ["default", ...(comp.states ?? [])];
        for (const state of states) {
          matrix.push({ kind: "component", page: page.name, bp: bp.name, component: comp.name, state });
        }
      }
    }
  }
  for (const flow of config.flows ?? []) {
    let stepIndex = 0;
    for (const step of flow.steps ?? []) {
      if (step.screenshot) {
        matrix.push({ kind: "flow_step", flow: flow.name, stepIndex, label: step.screenshot });
      }
      stepIndex++;
    }
  }
  return matrix;
}
