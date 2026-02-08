import React from 'react';
import Badge, { type BadgeProps } from './Badge';

export const DangerBadge = (p: Omit<BadgeProps, 'variant'>) => <Badge variant="red" {...p} />;
export const WarningBadge = (p: Omit<BadgeProps, 'variant'>) => <Badge variant="yellow" {...p} />;
export const SuccessBadge = (p: Omit<BadgeProps, 'variant'>) => <Badge variant="green" {...p} />;
export const InfoBadge = (p: Omit<BadgeProps, 'variant'>) => <Badge variant="blue" {...p} />;
export const NeutralBadge = (p: Omit<BadgeProps, 'variant'>) => <Badge variant="gray" {...p} />;

export default Badge;