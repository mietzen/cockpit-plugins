import React from "react";
import { Dropdown, DropdownProps } from "@patternfly/react-core";

export interface ActionMenuPortalProps extends Omit<DropdownProps, "popperProps"> {
  position?: "right" | "left" | "center";
}

export const ActionMenuPortal: React.FC<ActionMenuPortalProps> = ({
  position = "right",
  children,
  ...props
}) => {
  return (
    <Dropdown
      {...props}
      popperProps={{
        position,
        preventOverflow: true,
        appendTo: () => document.body,
      }}
    >
      {children}
    </Dropdown>
  );
};
