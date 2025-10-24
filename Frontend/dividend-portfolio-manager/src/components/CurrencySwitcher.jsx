// src/components/CurrencySwitcher.jsx - Currency filter dropdown matching AccountSelector style
import { createSignal, Show, For, createEffect, onCleanup } from 'solid-js';

export default function CurrencySwitcher(props) {
  const [isOpen, setIsOpen] = createSignal(false);
  let selectorRef;

  const currencyOptions = [
    {
      value: 'combined-cad',
      label: 'Combined (CAD)',
      icon: '💰',
      group: 'display',
      groupLabel: '💰 Display Currency',
      description: 'All holdings in CAD'
    },
    {
      value: 'combined-usd',
      label: 'Combined (USD)',
      icon: '💵',
      group: 'display',
      groupLabel: '💰 Display Currency',
      description: 'All holdings in USD'
    },
    {
      value: 'cad-only',
      label: 'CAD Only',
      icon: '🔍',
      group: 'filter',
      groupLabel: '🔍 Filter by Currency',
      description: 'Hide USD holdings'
    },
    {
      value: 'usd-only',
      label: 'USD Only',
      icon: '🔍',
      group: 'filter',
      groupLabel: '🔍 Filter by Currency',
      description: 'Hide CAD holdings'
    }
  ];

  const currentOption = () => currencyOptions.find(opt => opt.value === props.value) || currencyOptions[0];

  const handleSelect = (value) => {
    props.onChange?.(value);
    setIsOpen(false);
  };

  const toggleDropdown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOpen(!isOpen());
  };

  // Handle click outside to close dropdown
  const handleClickOutside = (event) => {
    if (isOpen() && selectorRef && !selectorRef.contains(event.target)) {
      setIsOpen(false);
    }
  };

  // Set up event listeners when dropdown opens
  createEffect(() => {
    if (isOpen()) {
      document.addEventListener('mousedown', handleClickOutside);
      onCleanup(() => {
        document.removeEventListener('mousedown', handleClickOutside);
      });
    }
  });

  // Global cleanup on component unmount
  onCleanup(() => {
    document.removeEventListener('mousedown', handleClickOutside);
  });

  const groupedOptions = () => {
    const groups = {
      display: [],
      filter: []
    };

    currencyOptions.forEach(option => {
      groups[option.group].push(option);
    });

    return groups;
  };

  return (
    <div class="account-selector currency-selector" ref={selectorRef}>
      <button
        class={`account-selector-button ${isOpen() ? 'open' : ''}`}
        onClick={toggleDropdown}
        type="button"
      >
        <div class="selected-account">
          <span class="account-icon">{currentOption().icon}</span>
          <span class="account-label">{currentOption().label}</span>
        </div>
        <span class="dropdown-arrow">{isOpen() ? '▲' : '▼'}</span>
      </button>

      <Show when={isOpen()}>
        <div class="account-dropdown">
          <div class="dropdown-content">
            {/* Display Currency Group */}
            <Show when={groupedOptions().display.length > 0}>
              <div class="dropdown-group">
                <div class="dropdown-group-label">💰 Display Currency</div>
                <For each={groupedOptions().display}>
                  {option => (
                    <div
                      class={`dropdown-option ${props.value === option.value ? 'selected' : ''}`}
                      onClick={() => handleSelect(option.value)}
                    >
                      <span class="option-icon">{option.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div class="option-label">{option.label}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--neutral-500)', marginTop: '0.1rem' }}>
                          {option.description}
                        </div>
                      </div>
                      <Show when={props.value === option.value}>
                        <span style={{ color: 'var(--success-500)', fontSize: '1rem' }}>✓</span>
                      </Show>
                    </div>
                  )}
                </For>
              </div>
            </Show>

            {/* Filter by Currency Group */}
            <Show when={groupedOptions().filter.length > 0}>
              <div class="dropdown-group">
                <div class="dropdown-group-label">🔍 Filter by Currency</div>
                <For each={groupedOptions().filter}>
                  {option => (
                    <div
                      class={`dropdown-option ${props.value === option.value ? 'selected' : ''}`}
                      onClick={() => handleSelect(option.value)}
                    >
                      <span class="option-icon">{option.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div class="option-label">{option.label}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--neutral-500)', marginTop: '0.1rem' }}>
                          {option.description}
                        </div>
                      </div>
                      <Show when={props.value === option.value}>
                        <span style={{ color: 'var(--success-500)', fontSize: '1rem' }}>✓</span>
                      </Show>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
}
