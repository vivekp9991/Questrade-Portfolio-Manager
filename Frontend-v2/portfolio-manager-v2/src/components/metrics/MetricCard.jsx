import { Show, For } from 'solid-js';
import './MetricCard.css';

const MetricCard = (props) => {
  // Check if value contains newlines for multi-line display
  const isMultiLine = () => typeof props.value === 'string' && props.value.includes('\n');
  const lines = () => isMultiLine() ? props.value.split('\n') : [props.value];

  // Determine color class based on props
  const getColorClass = () => {
    if (props.successTag) return 'positive';
    if (props.errorTag) return 'negative';
    return '';
  };

  return (
    <div class="metric-card">
      <div class="metric-card-header">
        <span class="metric-name">{props.name}</span>
      </div>
      <div class={`metric-value ${isMultiLine() ? 'multi-line' : ''} ${getColorClass()}`}>
        <Show when={isMultiLine()} fallback={props.value}>
          <For each={lines()}>
            {(line) => <div class="metric-line">{line}</div>}
          </For>
        </Show>
      </div>
      <div class="metric-footer">
        <span class="metric-info">{props.info}</span>
        <Show when={props.successTag}>
          <span class="metric-success-tag">
            {props.successTag}
          </span>
        </Show>
        <Show when={props.errorTag}>
          <span class="metric-error-tag">
            {props.errorTag}
          </span>
        </Show>
      </div>
    </div>
  );
};

export default MetricCard;
