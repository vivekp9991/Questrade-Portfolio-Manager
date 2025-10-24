// Formatting utilities

export function formatCurrency(value, decimals = 2) {
  if (value === null || value === undefined || isNaN(value)) return '$0.00';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return '$' + num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

export function formatNumber(value, decimals = 2) {
  if (value === null || value === undefined || isNaN(value)) return '0.00';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

export function formatPercent(value, decimals = 2) {
  if (value === null || value === undefined || isNaN(value)) return '0.00%';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }) + '%';
}

export function formatCompact(value) {
  if (value === null || value === undefined || isNaN(value)) return '0';
  const num = typeof value === 'string' ? parseFloat(value) : value;

  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toFixed(0);
}

export function getStockInitials(symbol) {
  if (!symbol) return 'XX';
  const clean = symbol.replace('.TO', '').replace('.U', '');
  return clean.slice(0, 2).toUpperCase();
}
