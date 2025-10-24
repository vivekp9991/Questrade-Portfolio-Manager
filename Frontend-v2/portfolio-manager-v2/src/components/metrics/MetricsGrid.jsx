import { Index } from 'solid-js';
import MetricCard from './MetricCard';
import './MetricsGrid.css';

const MetricsGrid = (props) => {
  // Default metrics structure if not provided
  const metrics = () => props.metrics || [
    {
      name: 'invested',
      value: '$0.00',
      info: 'total invested',
      successTag: null
    },
    {
      name: 'current',
      value: '$0.00',
      info: 'current value',
      successTag: null
    },
    {
      name: 'p&l',
      value: '$0.00',
      info: 'profit/loss',
      successTag: null
    },
    {
      name: 'return',
      value: '0.00%',
      info: 'total return',
      successTag: null
    },
    {
      name: 'yoc',
      value: '0.00%',
      info: 'yield on cost',
      successTag: null
    },
    {
      name: 'cash',
      value: '$0.00',
      info: 'available cash',
      successTag: null
    }
  ];

  return (
    <div class="metrics-grid">
      <Index each={metrics()}>
        {(metric) => (
          <MetricCard
            name={metric().name}
            value={metric().value}
            info={metric().info}
            successTag={metric().successTag}
            errorTag={metric().errorTag}
          />
        )}
      </Index>
    </div>
  );
};

export default MetricsGrid;
