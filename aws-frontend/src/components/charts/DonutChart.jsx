import { createMemo, For, Show } from 'solid-js';
import './DonutChart.css';

/**
 * Donut Chart Component using pure SVG
 * Displays data as a donut/ring chart with legend
 */
const DonutChart = (props) => {
  // Props:
  // - data: Array of { label, value, color, subLabel? }
  // - centerLabel: String to show in center (optional)
  // - centerValue: String/Number to show in center (optional)
  // - size: Chart size in pixels (default 200)
  // - strokeWidth: Ring thickness (default 40)
  // - showLegend: Boolean to show legend (default true)
  // - showValue: Boolean to show value in legend (default true)
  // - formatValue: Function to format value (optional, defaults to currency format)
  // - layout: 'vertical' (default) or 'horizontal' (chart left, legend right)
  // - legendColumns: Number of columns for legend grid (default 1)

  const size = () => props.size || 200;
  const strokeWidth = () => props.strokeWidth || 40;
  const radius = () => (size() - strokeWidth()) / 2;
  const circumference = () => 2 * Math.PI * radius();

  // Calculate total and percentages
  const total = createMemo(() => {
    if (!props.data || props.data.length === 0) return 0;
    return props.data.reduce((sum, item) => sum + (item.value || 0), 0);
  });

  // Calculate segments with offsets
  const segments = createMemo(() => {
    if (!props.data || props.data.length === 0) return [];

    const t = total();
    if (t === 0) return [];

    let offset = 0;
    return props.data.map((item, index) => {
      const percentage = (item.value / t) * 100;
      const dashLength = (percentage / 100) * circumference();
      const dashOffset = offset;
      offset += dashLength;

      return {
        ...item,
        percentage,
        dashLength,
        dashOffset,
        // Small gap between segments
        dashArray: `${dashLength - 2} ${circumference() - dashLength + 2}`
      };
    });
  });

  // Default colors if not provided
  const colors = [
    '#4ade80', // Green
    '#f97316', // Orange
    '#3b82f6', // Blue
    '#ef4444', // Red
    '#a855f7', // Purple
    '#eab308', // Yellow
    '#06b6d4', // Cyan
    '#ec4899', // Pink
    '#6b7280', // Gray
    '#10b981'  // Emerald
  ];

  const getColor = (item, index) => item.color || colors[index % colors.length];

  // Default currency formatter
  const defaultFormatValue = (value) => {
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  const formatValue = (value) => {
    if (props.formatValue) {
      return props.formatValue(value);
    }
    return defaultFormatValue(value);
  };

  const showValue = () => props.showValue !== false; // Default to true
  const layout = () => props.layout || 'vertical';
  const legendColumns = () => props.legendColumns || 1;

  const containerClass = () => {
    let cls = 'donut-chart-container';
    if (layout() === 'horizontal') cls += ' donut-horizontal';
    return cls;
  };

  const legendClass = () => {
    let cls = 'donut-legend';
    if (legendColumns() > 1) cls += ` donut-legend-grid donut-legend-cols-${legendColumns()}`;
    return cls;
  };

  return (
    <div class={containerClass()}>
      <div class="donut-chart-wrapper">
        <svg
          width={size()}
          height={size()}
          viewBox={`0 0 ${size()} ${size()}`}
          class="donut-chart"
        >
          {/* Background ring */}
          <circle
            cx={size() / 2}
            cy={size() / 2}
            r={radius()}
            fill="none"
            stroke="#21262d"
            stroke-width={strokeWidth()}
          />

          {/* Data segments */}
          <For each={segments()}>
            {(segment, index) => (
              <circle
                cx={size() / 2}
                cy={size() / 2}
                r={radius()}
                fill="none"
                stroke={getColor(segment, index())}
                stroke-width={strokeWidth()}
                stroke-dasharray={segment.dashArray}
                stroke-dashoffset={-segment.dashOffset}
                transform={`rotate(-90 ${size() / 2} ${size() / 2})`}
                class="donut-segment"
              />
            )}
          </For>
        </svg>

        {/* Center content */}
        <div class="donut-center">
          <Show when={props.centerValue}>
            <div class="donut-center-value">{props.centerValue}</div>
          </Show>
          <Show when={props.centerLabel}>
            <div class="donut-center-label">{props.centerLabel}</div>
          </Show>
        </div>
      </div>

      {/* Legend */}
      <Show when={props.showLegend !== false}>
        <div class={legendClass()}>
          <For each={segments()}>
            {(segment, index) => (
              <div class="legend-item">
                <span
                  class="legend-color"
                  style={{ background: getColor(segment, index()) }}
                />
                <div class="legend-text">
                  <span class="legend-label">{segment.label}</span>
                  <Show when={segment.subLabel}>
                    <span class="legend-sublabel">{segment.subLabel}</span>
                  </Show>
                </div>
                <div class="legend-values">
                  <span class="legend-value">
                    <Show when={showValue()} fallback={`${segment.percentage.toFixed(1)}%`}>
                      {formatValue(segment.value)}
                    </Show>
                  </span>
                  <span class="legend-percent">({segment.percentage.toFixed(1)}%)</span>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default DonutChart;
