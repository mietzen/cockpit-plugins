import React, { useState, useEffect } from "react";
import {
  Modal,
  ModalVariant,
  Form,
  FormGroup,
  TextInput,
  FormSelect,
  FormSelectOption,
  Checkbox,
  Button,
  Alert,
  Grid,
  GridItem,
} from "@patternfly/react-core";
import { SanoidDatasetPolicy } from "../../types";

interface SanoidScheduleModalProps {
  isOpen: boolean;
  policy: SanoidDatasetPolicy | null;
  datasetOptions: string[];
  templates: Record<string, Record<string, any>>;
  onClose: () => void;
  onSubmit: (policy: SanoidDatasetPolicy) => Promise<void>;
}

const TEMPLATE_CUSTOM = "custom";
const DEFAULT_RETENTION_HOURLY = 24;
const DEFAULT_RETENTION_DAILY = 30;
const DEFAULT_RETENTION_MONTHLY = 3;
const DEFAULT_RETENTION_YEARLY = 0;

export const SanoidScheduleModal: React.FC<SanoidScheduleModalProps> = ({
  isOpen,
  policy,
  datasetOptions,
  templates,
  onClose,
  onSubmit,
}) => {
  const isEditing = policy !== null;
  const [dataset, setDataset] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<string>(TEMPLATE_CUSTOM);
  const [hourly, setHourly] = useState<number | string>(DEFAULT_RETENTION_HOURLY);
  const [daily, setDaily] = useState<number | string>(DEFAULT_RETENTION_DAILY);
  const [monthly, setMonthly] = useState<number | string>(DEFAULT_RETENTION_MONTHLY);
  const [yearly, setYearly] = useState<number | string>(DEFAULT_RETENTION_YEARLY);
  const [autosnap, setAutosnap] = useState<boolean>(true);
  const [autoprune, setAutoprune] = useState<boolean>(true);
  const [recursive, setRecursive] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (policy) {
      setDataset(policy.dataset);
      setSelectedTemplate(policy.use_template || policy.template || TEMPLATE_CUSTOM);
      setHourly(policy.hourly !== undefined ? policy.hourly : "");
      setDaily(policy.daily !== undefined ? policy.daily : "");
      setMonthly(policy.monthly !== undefined ? policy.monthly : "");
      setYearly(policy.yearly !== undefined ? policy.yearly : "");
      setAutosnap(policy.autosnap !== false);
      setAutoprune(policy.autoprune !== false);
      setRecursive(Boolean(policy.recursive));
    } else {
      const initialDataset = datasetOptions.length > 0 ? datasetOptions[0] : "";
      setDataset(initialDataset);
      setSelectedTemplate(TEMPLATE_CUSTOM);
      setHourly(DEFAULT_RETENTION_HOURLY);
      setDaily(DEFAULT_RETENTION_DAILY);
      setMonthly(DEFAULT_RETENTION_MONTHLY);
      setYearly(DEFAULT_RETENTION_YEARLY);
      setAutosnap(true);
      setAutoprune(true);
      setRecursive(false);
    }
    setError(null);
  }, [isOpen, policy, datasetOptions]);

  const handleTemplateChange = (tmplKey: string) => {
    setSelectedTemplate(tmplKey);
    if (tmplKey === TEMPLATE_CUSTOM) {
      return;
    }

    const tmpl = templates[tmplKey];
    if (tmpl) {
      if (tmpl.hourly !== undefined) {
        setHourly(tmpl.hourly);
      }
      if (tmpl.daily !== undefined) {
        setDaily(tmpl.daily);
      }
      if (tmpl.monthly !== undefined) {
        setMonthly(tmpl.monthly);
      }
      if (tmpl.yearly !== undefined) {
        setYearly(tmpl.yearly);
      }
      if (tmpl.autosnap !== undefined) {
        setAutosnap(tmpl.autosnap);
      }
      if (tmpl.autoprune !== undefined) {
        setAutoprune(tmpl.autoprune);
      }
      if (tmpl.recursive !== undefined) {
        setRecursive(Boolean(tmpl.recursive));
      }
    }
  };

  const parseRetention = (val: number | string): number | undefined => {
    if (val === "" || val === undefined) {
      return undefined;
    }
    const num = Number(val);
    return isNaN(num) ? undefined : Math.max(0, num);
  };

  const handleSave = async () => {
    const trimmedDataset = dataset.trim();
    if (!trimmedDataset) {
      setError("Please select or specify a valid dataset path");
      return;
    }

    setLoading(true);
    setError(null);

    const newPolicy: SanoidDatasetPolicy = {
      dataset: trimmedDataset,
      use_template: selectedTemplate !== TEMPLATE_CUSTOM ? selectedTemplate : undefined,
      hourly: parseRetention(hourly),
      daily: parseRetention(daily),
      monthly: parseRetention(monthly),
      yearly: parseRetention(yearly),
      autosnap,
      autoprune,
      recursive,
    };

    try {
      await onSubmit(newPolicy);
      setLoading(false);
      onClose();
    } catch (err: any) {
      setError(err.message || String(err));
      setLoading(false);
    }
  };

  const templateKeys = Object.keys(templates);

  return (
    <Modal
      variant={ModalVariant.medium}
      title={isEditing ? `Edit Snapshot Policy: ${policy.dataset}` : "Configure Snapshot Policy"}
      isOpen={isOpen}
      onClose={onClose}
      appendTo={() => document.body}
      actions={[
        <Button
          key="save"
          variant="primary"
          onClick={handleSave}
          isDisabled={loading || !dataset.trim()}
          isLoading={loading}
        >
          {isEditing ? "Save Policy" : "Create Policy"}
        </Button>,
        <Button key="cancel" variant="secondary" onClick={onClose} isDisabled={loading}>
          Cancel
        </Button>,
      ]}
    >
      <Form style={{ maxWidth: "600px" }}>
        <FormGroup label="Dataset / Target Path" isRequired fieldId="sanoid-dataset">
          {isEditing ? (
            <TextInput id="sanoid-dataset" value={dataset} isReadOnly />
          ) : datasetOptions.length > 0 ? (
            <FormSelect
              id="sanoid-dataset"
              value={dataset}
              onChange={(_event, val) => setDataset(val)}
            >
              {datasetOptions.map((opt) => (
                <FormSelectOption key={opt} value={opt} label={opt} />
              ))}
            </FormSelect>
          ) : (
            <TextInput
              id="sanoid-dataset"
              value={dataset}
              onChange={(_event, val) => setDataset(val)}
              placeholder="e.g. tank/data"
            />
          )}
        </FormGroup>

        {templateKeys.length > 0 && (
          <FormGroup label="Base Template" fieldId="sanoid-template">
            <FormSelect
              id="sanoid-template"
              value={selectedTemplate}
              onChange={(_event, val) => handleTemplateChange(val)}
            >
              <FormSelectOption value={TEMPLATE_CUSTOM} label="Custom Configuration" />
              {templateKeys.map((key) => (
                <FormSelectOption key={key} value={key} label={`Template: ${key}`} />
              ))}
            </FormSelect>
          </FormGroup>
        )}

        <Title headingLevel="h4" size="md" style={{ marginTop: "1rem", marginBottom: "0.5rem" }}>
          Snapshot Retention Counts
        </Title>

        <Grid hasGutter>
          <GridItem span={6}>
            <FormGroup label="Hourly Snapshots" fieldId="sanoid-hourly">
              <TextInput
                id="sanoid-hourly"
                type="number"
                min={0}
                value={hourly}
                onChange={(_event, val) => setHourly(val)}
                placeholder="24"
              />
            </FormGroup>
          </GridItem>
          <GridItem span={6}>
            <FormGroup label="Daily Snapshots" fieldId="sanoid-daily">
              <TextInput
                id="sanoid-daily"
                type="number"
                min={0}
                value={daily}
                onChange={(_event, val) => setDaily(val)}
                placeholder="30"
              />
            </FormGroup>
          </GridItem>
          <GridItem span={6}>
            <FormGroup label="Monthly Snapshots" fieldId="sanoid-monthly">
              <TextInput
                id="sanoid-monthly"
                type="number"
                min={0}
                value={monthly}
                onChange={(_event, val) => setMonthly(val)}
                placeholder="3"
              />
            </FormGroup>
          </GridItem>
          <GridItem span={6}>
            <FormGroup label="Yearly Snapshots" fieldId="sanoid-yearly">
              <TextInput
                id="sanoid-yearly"
                type="number"
                min={0}
                value={yearly}
                onChange={(_event, val) => setYearly(val)}
                placeholder="0"
              />
            </FormGroup>
          </GridItem>
        </Grid>

        <Title headingLevel="h4" size="md" style={{ marginTop: "1.25rem", marginBottom: "0.5rem" }}>
          Policy Options
        </Title>

        <FormGroup fieldId="sanoid-autosnap">
          <Checkbox
            id="sanoid-autosnap"
            label="Enable Autosnap (Automatically create scheduled snapshots)"
            isChecked={autosnap}
            onChange={(_event, checked) => setAutosnap(checked)}
          />
        </FormGroup>

        <FormGroup fieldId="sanoid-autoprune">
          <Checkbox
            id="sanoid-autoprune"
            label="Enable Autoprune (Automatically delete expired snapshots according to retention)"
            isChecked={autoprune}
            onChange={(_event, checked) => setAutoprune(checked)}
          />
        </FormGroup>

        <FormGroup fieldId="sanoid-recursive">
          <Checkbox
            id="sanoid-recursive"
            label="Recursive (Apply this policy to all child datasets)"
            isChecked={recursive}
            onChange={(_event, checked) => setRecursive(checked)}
          />
        </FormGroup>

        {error && (
          <Alert variant="danger" title="Error saving schedule" style={{ marginTop: "1rem" }}>
            {error}
          </Alert>
        )}
      </Form>
    </Modal>
  );
};
