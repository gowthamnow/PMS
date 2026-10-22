import React from 'react';
import { TaskStatus } from '../../types';
import { Badge } from '../ui/Badge';

export interface StatusBadgeProps {
  status: TaskStatus;
  size?: 'sm' | 'md';
  className?: string;
  dot?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  size = 'sm',
  className,
  dot = true,
}) => {
  return <Badge variant="status" value={status} size={size} dot={dot} className={className} />;
};
