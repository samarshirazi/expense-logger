import React from 'react';
import './SummaryCards.css';

function SummaryCards({
  cards = [],
  variant = 'grid',
  interactive = false,
  onCardSelect,
  className = ''
}) {
  if (!Array.isArray(cards) || cards.length === 0) {
    return null;
  }

  return (
    <div className={`summary-cards analytics-summary-cards analytics-summary-cards-${variant} ${className}`}>
      {cards.map(card => {
        const isInteractive = (card.interactive ?? interactive) && !card.action;
        const CardTag = (isInteractive || card.onClick) ? 'button' : 'div';

        const handleClick = (event) => {
          if (card.onClick) {
            card.onClick(card, event);
            return;
          }
          if (isInteractive && onCardSelect) {
            onCardSelect(card.id, card, event);
          }
        };

        return (
          <CardTag
            key={card.id || card.label}
            className={`summary-card ${card.trendDirection || ''} ${card.variant || ''}`}
            type={CardTag === 'button' ? 'button' : undefined}
            onClick={CardTag === 'button' ? handleClick : undefined}
          >
            {card.icon && <div className="card-icon">{card.icon}</div>}
            <div className="card-content">
              {card.label && <div className="card-label">{card.label}</div>}
              {card.value && (
                <div className={card.valueVariant === 'small' ? 'card-value-small' : 'card-value'}>
                  {card.value}
                </div>
              )}
              {card.amount && <div className="card-amount">{card.amount}</div>}
              {card.subValue && <div className="card-subvalue">{card.subValue}</div>}
              {card.trend && (
                <div className={`card-trend ${card.trendDirection || ''}`}>
                  {card.trend}
                </div>
              )}
              {card.detail && <div className="card-ai-tip">{card.detail}</div>}
              {card.footnote && <div className="summary-card-footnote">{card.footnote}</div>}
              {card.delta && card.delta.label && (
                <div
                  className={`summary-card-delta ${
                    card.delta.direction === 'positive'
                      ? 'summary-card-delta-positive'
                      : card.delta.direction === 'negative'
                        ? 'summary-card-delta-negative'
                        : ''
                  }`}
                >
                  {card.delta.icon} {card.delta.label}
                </div>
              )}
              {card.action && (
                <button
                  type="button"
                  className="summary-card-button"
                  onClick={(event) => {
                    event.stopPropagation();
                    card.action?.onClick?.(card, event);
                  }}
                >
                  {card.action.label}
                </button>
              )}
            </div>
          </CardTag>
        );
      })}
    </div>
  );
}

export default SummaryCards;
