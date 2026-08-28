import React, { useState, useEffect } from "react";
import {
  Card,
  CardTitle,
  CardBody,
  Form,
  FormGroup,
  TextInput,
  FormSelect,
  FormSelectOption,
  Checkbox,
  Button,
  ActionGroup,
  Title,
  Spinner,
} from "@patternfly/react-core";
import { ZPool } from "../types";
import { zfsApi } from "../api/zfsClient";

interface PoolSettingsTabProps {
  pool: ZPool;
  onSaveProperties: (poolName: string, properties: Record<string, string>) => void;
}

export const PoolSettingsTab: React.FC<PoolSettingsTabProps> = ({
  pool,
  onSaveProperties,
}) => {
  const [loading, setLoading] = useState(true);
  const [properties, setProperties] = useState<Record<string, string>>({});
  const [autoexpand, setAutoexpand] = useState(false);
  const [autoreplace, setAutoreplace] = useState(false);
  const [autotrim, setAutotrim] = useState(false);
  const [failmode, setFailmode] = useState("wait");
  const [comment, setComment] = useState("");

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    zfsApi
      .getPoolProperties(pool.name)
      .then((props) => {
        if (isMounted) {
          setProperties(props);
          setAutoexpand(props["autoexpand"] === "on");
          setAutoreplace(props["autoreplace"] === "on");
          setAutotrim(props["autotrim"] === "on");
          setFailmode(props["failmode"] || "wait");
          setComment(props["comment"] === "-" ? "" : props["comment"] || "");
          setLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [pool.name]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const updatePayload: Record<string, string> = {
      autoexpand: autoexpand ? "on" : "off",
      autoreplace: autoreplace ? "on" : "off",
      autotrim: autotrim ? "on" : "off",
      failmode: failmode,
      comment: comment.trim() || "-",
    };
    onSaveProperties(pool.name, updatePayload);
  };

  if (loading) {
    return <Spinner />;
  }

  return (
    <div>
      <Title headingLevel="h2" size="xl" style={{ marginBottom: "1.5rem", fontWeight: 600 }}>
        Pool Properties &amp; Settings
      </Title>

      <Card isPlain style={{ border: "1px solid var(--pf-v5-global--BorderColor--100)" }}>
        <CardTitle>Configuration</CardTitle>
        <CardBody>
          <Form onSubmit={handleSubmit} style={{ maxWidth: "600px" }}>
            <FormGroup label="Pool name" fieldId="pool-name">
              <TextInput id="pool-name" value={pool.name} isReadOnly />
            </FormGroup>

            <FormGroup label="Pool GUID" fieldId="pool-guid">
              <TextInput id="pool-guid" value={pool.guid || "-"} isReadOnly />
            </FormGroup>

            <FormGroup label="Sector size (ashift)" fieldId="pool-ashift">
              <TextInput id="pool-ashift" value={properties["ashift"] || "Auto"} isReadOnly />
            </FormGroup>

            <FormGroup fieldId="pool-autoexpand">
              <Checkbox
                id="pool-autoexpand"
                label="Autoexpand capacity when disks are replaced with larger ones"
                isChecked={autoexpand}
                onChange={(_event, checked) => setAutoexpand(checked)}
              />
            </FormGroup>

            <FormGroup fieldId="pool-autoreplace">
              <Checkbox
                id="pool-autoreplace"
                label="Autoreplace failed devices using hot spares"
                isChecked={autoreplace}
                onChange={(_event, checked) => setAutoreplace(checked)}
              />
            </FormGroup>

            <FormGroup fieldId="pool-autotrim">
              <Checkbox
                id="pool-autotrim"
                label="Autotrim SSD devices in background"
                isChecked={autotrim}
                onChange={(_event, checked) => setAutotrim(checked)}
              />
            </FormGroup>

            <FormGroup label="Failure mode (failmode)" fieldId="pool-failmode">
              <FormSelect
                id="pool-failmode"
                value={failmode}
                onChange={(_event, val) => setFailmode(val)}
              >
                <FormSelectOption value="wait" label="wait (Block I/O until device is restored)" />
                <FormSelectOption value="continue" label="continue (Return EIO to application)" />
                <FormSelectOption value="panic" label="panic (Reboot system to prevent corruption)" />
              </FormSelect>
            </FormGroup>

            <FormGroup label="Administrative comment" fieldId="pool-comment">
              <TextInput
                id="pool-comment"
                value={comment}
                onChange={(_event, val) => setComment(val)}
                placeholder="Optional description"
              />
            </FormGroup>

            <ActionGroup>
              <Button variant="primary" type="submit">
                Save properties
              </Button>
            </ActionGroup>
          </Form>
        </CardBody>
      </Card>
    </div>
  );
};
