import React from 'react';

interface Props {
  current: bigint;
  goal: bigint;
}

export const ProgressBar: React.FC<Props> = ({ current, goal }) => {
  const percent = goal > 0n ? Number((current * 100n) / goal) : 0;
  return (
    <div style={{ border: '1px solid #ccc', borderRadius: 6, padding: 4 }}>
      <div
        style={{
          width: `${Math.min(percent, 100)}%`,
          background: '#3b82f6',
          height: 12,
          borderRadius: 4,
          transition: 'width 0.2s ease',
        }}
      />
      <small>{percent}% of goal</small>
    </div>
  );
};
