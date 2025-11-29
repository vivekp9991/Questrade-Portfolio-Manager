import './StockCell.css';

const StockCell = (props) => {
  // Generate initials from ticker (first 2 characters)
  const getInitials = (ticker) => {
    if (!ticker) return '??';
    return ticker.substring(0, 2).toUpperCase();
  };

  // Generate gradient based on ticker
  const getGradient = (ticker) => {
    if (!ticker) return 'linear-gradient(135deg, #58a6ff 0%, #1f6feb 100%)';

    const colors = [
      'linear-gradient(135deg, #58a6ff 0%, #1f6feb 100%)',
      'linear-gradient(135deg, #f78166 0%, #da3633 100%)',
      'linear-gradient(135deg, #a371f7 0%, #8957e5 100%)',
      'linear-gradient(135deg, #39d353 0%, #26a641 100%)',
      'linear-gradient(135deg, #ffa657 0%, #e85aad 100%)',
      'linear-gradient(135deg, #79c0ff 0%, #58a6ff 100%)',
    ];

    const charCode = ticker.charCodeAt(0);
    return colors[charCode % colors.length];
  };

  return (
    <div class="stock-cell">
      <div
        class="stock-icon"
        style={{ background: getGradient(props.ticker) }}
      >
        {getInitials(props.ticker)}
      </div>
      <div class="stock-info">
        <div class="stock-ticker-row">
          <span class="stock-ticker">{props.ticker || 'N/A'}</span>
          <span class={`currency-tag currency-${(props.currency || 'CAD').toLowerCase()}`}>
            {props.currency || 'CAD'}
          </span>
        </div>
        <div class="stock-company">{props.company || 'Unknown Company'}</div>
      </div>
    </div>
  );
};

export default StockCell;
