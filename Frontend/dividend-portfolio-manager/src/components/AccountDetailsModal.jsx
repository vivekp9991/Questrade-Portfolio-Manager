// src/components/AccountDetailsModal.jsx - COMPLETELY FIXED VERSION
import { createSignal, For, Show, createEffect } from 'solid-js';

function AccountDetailsModal(props) {
    // Debug logging
    createEffect(() => {
        console.log('🔍 AccountDetailsModal props:', {
            isOpen: props.isOpen,
            stock: props.stock?.symbol || 'none',
            hasOnClose: typeof props.onClose === 'function',
            stockData: props.stock
        });
    });

    const formatCurrency = (num) => {
        const n = Number(num);
        return isNaN(n) ? '$0.00' : `$${n.toFixed(2)}`;
    };

    const formatShares = (num) => {
        const n = Number(num);
        return isNaN(n) ? '0' : n.toLocaleString();
    };

    const getTotalShares = () => {
        if (!props.stock?.individualPositions) return '0';
        return props.stock.individualPositions.reduce((sum, pos) => {
            return sum + (Number(pos.shares) || 0);
        }, 0).toLocaleString();
    };

    const getTotalValue = () => {
        if (!props.stock?.individualPositions) return '$0.00';
        const total = props.stock.individualPositions.reduce((sum, pos) => {
            const shares = Number(pos.shares) || 0;
            const priceStr = pos.avgCost || '$0.00';
            const price = Number(priceStr.toString().replace(/[$,]/g, '')) || 0;
            return sum + (shares * price);
        }, 0);
        return formatCurrency(total);
    };

    const handleOverlayClick = (e) => {
        console.log('🖱️ Overlay clicked');
        if (e.target === e.currentTarget) {
            console.log('✅ Closing modal via overlay click');
            props.onClose?.();
        }
    };

    const handleCloseClick = (e) => {
        console.log('🖱️ Close button clicked');
        e.preventDefault();
        e.stopPropagation();
        props.onClose?.();
    };

    // Handle escape key
    createEffect(() => {
        if (props.isOpen) {
            const handleEscape = (e) => {
                if (e.key === 'Escape') {
                    console.log('⌨️ Escape key pressed, closing modal');
                    props.onClose?.();
                }
            };
            
            document.addEventListener('keydown', handleEscape);
            document.body.style.overflow = 'hidden';
            
            return () => {
                document.removeEventListener('keydown', handleEscape);
                document.body.style.overflow = '';
            };
        }
    });

    // Don't render if not open
    if (!props.isOpen) {
        console.log('❌ Modal not open, not rendering');
        return null;
    }

    if (!props.stock) {
        console.log('❌ No stock data, not rendering');
        return null;
    }

    console.log('✅ Modal rendering with stock:', props.stock.symbol);

    return (
        <div 
            style={{
                position: 'fixed',
                top: '0',
                left: '0',
                right: '0',
                bottom: '0',
                background: 'rgba(15, 23, 42, 0.75)',
                backdropFilter: 'blur(8px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: '1000',
                padding: '1rem'
            }}
            onClick={handleOverlayClick}
        >
            <div 
                style={{
                    background: 'white',
                    borderRadius: '16px',
                    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
                    width: '100%',
                    maxWidth: '600px',
                    maxHeight: '90vh',
                    overflow: 'hidden',
                    border: '1px solid #e2e8f0',
                    position: 'relative'
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Modal Header */}
                <div style={{
                    padding: '1.5rem 2rem',
                    borderBottom: '1px solid #e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'linear-gradient(135deg, #f8fafc 0%, white 100%)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{
                            background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                            color: 'white',
                            padding: '0.5rem 1rem',
                            borderRadius: '12px',
                            fontWeight: '700',
                            fontSize: '0.9rem',
                            letterSpacing: '0.025em',
                            boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
                        }}>
                            {props.stock.symbol}
                        </div>
                        <h2 style={{
                            fontSize: '1.25rem',
                            fontWeight: '600',
                            color: '#1e293b',
                            margin: '0'
                        }}>
                            Account Details
                        </h2>
                    </div>
                    <button
                        style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            border: '1px solid #d1d5db',
                            background: 'white',
                            color: '#6b7280',
                            fontSize: '1.25rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            fontWeight: '400',
                            lineHeight: '1'
                        }}
                        onClick={handleCloseClick}
                        type="button"
                    >
                        ×
                    </button>
                </div>

                {/* Modal Content */}
                <div style={{
                    padding: '1.5rem 2rem',
                    maxHeight: '60vh',
                    overflowY: 'auto'
                }}>
                    {/* Summary Section */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                        gap: '1rem',
                        marginBottom: '2rem',
                        padding: '1rem',
                        background: 'linear-gradient(135deg, #f8fafc 0%, rgba(59, 130, 246, 0.05) 100%)',
                        borderRadius: '12px',
                        border: '1px solid #e2e8f0'
                    }}>
                        <div style={{
                            textAlign: 'center',
                            padding: '0.75rem',
                            background: 'white',
                            borderRadius: '8px',
                            border: '1px solid #e2e8f0',
                            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)'
                        }}>
                            <div style={{
                                fontSize: '0.75rem',
                                color: '#6b7280',
                                fontWeight: '500',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                marginBottom: '0.5rem'
                            }}>
                                Total Shares
                            </div>
                            <div style={{
                                fontSize: '1.125rem',
                                fontWeight: '700',
                                color: '#1e293b'
                            }}>
                                {getTotalShares()}
                            </div>
                        </div>

                        <div style={{
                            textAlign: 'center',
                            padding: '0.75rem',
                            background: 'white',
                            borderRadius: '8px',
                            border: '1px solid #e2e8f0',
                            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)'
                        }}>
                            <div style={{
                                fontSize: '0.75rem',
                                color: '#6b7280',
                                fontWeight: '500',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                marginBottom: '0.5rem'
                            }}>
                                Total Accounts
                            </div>
                            <div style={{
                                fontSize: '1.125rem',
                                fontWeight: '700',
                                color: '#1e293b'
                            }}>
                                {props.stock.individualPositions?.length || 0}
                            </div>
                        </div>

                        <div style={{
                            textAlign: 'center',
                            padding: '0.75rem',
                            background: 'white',
                            borderRadius: '8px',
                            border: '1px solid #e2e8f0',
                            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)'
                        }}>
                            <div style={{
                                fontSize: '0.75rem',
                                color: '#6b7280',
                                fontWeight: '500',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                marginBottom: '0.5rem'
                            }}>
                                Combined Value
                            </div>
                            <div style={{
                                fontSize: '1.125rem',
                                fontWeight: '700',
                                color: '#059669'
                            }}>
                                {getTotalValue()}
                            </div>
                        </div>
                    </div>

                    {/* Individual Accounts */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <Show when={props.stock.individualPositions?.length > 0} fallback={
                            <div style={{
                                textAlign: 'center',
                                padding: '3rem 2rem',
                                color: '#6b7280'
                            }}>
                                <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: '0.5' }}>🏦</div>
                                <div style={{ fontSize: '1.125rem', fontWeight: '600', color: '#374151', marginBottom: '0.5rem' }}>
                                    No Account Details
                                </div>
                                <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                                    Individual position data not available
                                </div>
                            </div>
                        }>
                            <For each={props.stock.individualPositions || []}>
                                {(position, index) => (
                                    <div style={{
                                        background: 'white',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '12px',
                                        overflow: 'hidden',
                                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
                                        transition: 'all 0.2s ease'
                                    }}>
                                        <div style={{
                                            padding: '1rem 1.25rem',
                                            background: 'linear-gradient(135deg, #f8fafc 0%, white 100%)',
                                            borderBottom: '1px solid #e2e8f0',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <div style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.5rem',
                                                    background: '#dbeafe',
                                                    padding: '0.375rem 0.75rem',
                                                    borderRadius: '20px',
                                                    border: '1px solid #bfdbfe'
                                                }}>
                                                    <span style={{ fontSize: '0.9rem' }}>
                                                        {position.accountType === 'TFSA' ? '🔒' : 
                                                         position.accountType === 'FHSA' ? '🏠' : 
                                                         position.accountType === 'RRSP' ? '📈' :
                                                         position.accountType === 'Cash' ? '💰' : '📊'}
                                                    </span>
                                                    <span style={{
                                                        fontSize: '0.75rem',
                                                        fontWeight: '700',
                                                        color: '#1d4ed8',
                                                        textTransform: 'uppercase',
                                                        letterSpacing: '0.05em'
                                                    }}>
                                                        {position.accountType || 'UNKNOWN'}
                                                    </span>
                                                </div>
                                            </div>
                                            <div style={{
                                                fontSize: '0.8rem',
                                                color: '#6b7280',
                                                fontWeight: '500'
                                            }}>
                                                Account {position.accountName || `#${index() + 1}`}
                                            </div>
                                        </div>
                                        
                                        <div style={{
                                            padding: '1.25rem',
                                            display: 'grid',
                                            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                                            gap: '1rem'
                                        }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                                <span style={{
                                                    fontSize: '0.7rem',
                                                    color: '#6b7280',
                                                    fontWeight: '600',
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '0.05em'
                                                }}>
                                                    Shares
                                                </span>
                                                <span style={{
                                                    fontSize: '0.875rem',
                                                    fontWeight: '600',
                                                    color: '#1e293b'
                                                }}>
                                                    {formatShares(position.shares)} shares
                                                </span>
                                            </div>
                                            
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                                <span style={{
                                                    fontSize: '0.7rem',
                                                    color: '#6b7280',
                                                    fontWeight: '600',
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '0.05em'
                                                }}>
                                                    Avg Cost
                                                </span>
                                                <span style={{
                                                    fontSize: '0.875rem',
                                                    fontWeight: '600',
                                                    color: '#1e293b'
                                                }}>
                                                    {position.avgCost || '$0.00'}
                                                </span>
                                            </div>
                                            
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                                <span style={{
                                                    fontSize: '0.7rem',
                                                    color: '#059669',
                                                    fontWeight: '600',
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '0.05em'
                                                }}>
                                                    Market Value
                                                </span>
                                                <span style={{
                                                    fontSize: '0.875rem',
                                                    fontWeight: '600',
                                                    color: '#059669',
                                                    background: 'rgba(34, 197, 94, 0.05)',
                                                    padding: '0.25rem 0.5rem',
                                                    borderRadius: '6px',
                                                    border: '1px solid rgba(34, 197, 94, 0.2)',
                                                    textAlign: 'center'
                                                }}>
                                                    {position.marketValue || '$0.00'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </For>
                        </Show>
                    </div>
                </div>

                {/* Modal Footer */}
                <div style={{
                    padding: '1.25rem 2rem',
                    borderTop: '1px solid #e2e8f0',
                    background: '#f8fafc',
                    display: 'flex',
                    gap: '0.75rem',
                    justifyContent: 'flex-end'
                }}>
                    <button
                        style={{
                            padding: '0.75rem 1.5rem',
                            borderRadius: '10px',
                            fontSize: '0.875rem',
                            fontWeight: '600',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            border: '1px solid #d1d5db',
                            background: 'white',
                            color: '#374151'
                        }}
                        onClick={handleCloseClick}
                        type="button"
                    >
                        Close
                    </button>
                    <button
                        style={{
                            padding: '0.75rem 1.5rem',
                            borderRadius: '10px',
                            fontSize: '0.875rem',
                            fontWeight: '600',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            border: '1px solid #2563eb',
                            background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                            color: 'white',
                            boxShadow: '0 4px 12px rgba(59, 130, 246, 0.25)'
                        }}
                        type="button"
                    >
                        📊 View Details
                    </button>
                </div>
            </div>
        </div>
    );
}

export default AccountDetailsModal;