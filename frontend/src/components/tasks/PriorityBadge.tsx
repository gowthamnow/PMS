import React from 'react';
import { Priority } from '../../types';
import { Badge } from '../ui/Badge';

export interface PriorityBadgeProps {
  priority: Priority;
  size?: 'sm' | 'md';
  className?: string;
}

export const PriorityBadge: React.FC<PriorityBadgeProps> = ({
  priority,
  size = 'sm',
  className,
}) => {
  return <Badge variant="priority" value={priority} size={size} className={className} />;
};
