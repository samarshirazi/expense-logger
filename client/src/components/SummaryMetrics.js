import React from 'react';
import './SummaryMetrics.css';

function SummaryMetrics({ metrics = [], columns = 'repeat(auto-fit, minmax(200px, 1fr))', className = '' }) {
  if (!metrics.length) {
    return null;
  }

  return (
    <div className={`summary-metrics ${className}`} style={{ gridTemplateColumns: columns }}>
      {metrics.map((metric, index) => {
        const {
          id,
          icon,
          title,
          value,
          subtitle,
          note,
          valueColor,
          progress,
          footnote,
          accent
        } = metric;

        return (
          <div key={id || title || index} className="summary-metric-card">
            {icon && <span className="summary-metric-icon">{icon}</span>}
            {title && <div className="summary-metric-title">{title}</div>}
            {value != null && (
              <div className="summary-metric-value" style={{ color: valueColor || undefined }}>
                {value}
              </div>
            )}
            {subtitle && <div className="summary-metric-subtitle">{subtitle}</div>}
            {note && <div className="summary-metric-note">{note}</div>}
            {accent && <div className="summary-metric-accent">{accent}</div>}
            {progress && (
              <div className="summary-metric-progress">
                <div
                  className="summary-metric-progress-bar"
                  style={{
                    width: `${Math.min(Math.max(progress.value || 0, 0), 100)}%`,
                    backgroundColor: progress.color || '#667eea'
                  }}
                ></div>
                {progress.label && (
                  <div
                    className="summary-metric-progress-label"
                    style={{ color: progress.color || undefined }}
                  >
                    {progress.label}
                  </div>
                )}
              </div>
            )}
            {footnote && <div className="summary-metric-footnote">{footnote}</div>}
          </div>
        );
      })}
    </div>
  );
}

export default SummaryMetrics;
