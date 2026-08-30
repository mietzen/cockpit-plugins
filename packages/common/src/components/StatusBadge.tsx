import React from "react";
import { Label } from "@patternfly/react-core";

export type BadgeVariant = "blue" | "green" | "orange" | "red" | "purple" | "grey";

export interface StatusBadgeProps {
  variant: BadgeVariant;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  isCompact?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  variant,
  icon,
  children,
  className = "",
  isCompact = false,
}) => {
  return (
    <Label
      color={variant as any}
      icon={icon}
      isCompact={isCompact}
      className={`pf-m-${variant} ${className}`.trim()}
    >
      {children}
    </Label>
  );
};
