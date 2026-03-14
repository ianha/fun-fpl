export function formatCost(cost: number) {
  return `£${(cost / 10).toFixed(1)}m`;
}

export function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

