import React from 'react';

export interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export default function Card({ children, className = '', padding = 'md' }: CardProps) {
  return (
    <div className={`card card-padding-${padding} ${className}`}>
      {children}
    </div>
  );
}
