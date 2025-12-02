import { useAuth, useListGalleries } from "@/hooks";
import { useGalleryContext } from "@/hooks";
import {
  createListCollection,
  Field,
  Input as FieldInput,
  Select as FieldSelect,
  HStack,
  Icon,
  Portal,
  Text,
} from "@chakra-ui/react";
import { useEffect, useMemo, useState } from "react";
import type { FieldError, FieldValues } from "react-hook-form";
import { HiStar } from "react-icons/hi2";
import { Navigate } from "react-router";

interface FormProps {
  label: string;
  name: string;
  invalid: boolean;
  placeholder?: string;
  defaultValue?: string;
  errors?: Record<string, FieldError>;
  width?: string;
  maxW?: string;
  disabled?: boolean;
}

export interface InputProps extends FormProps, FieldValues {
  type: string;
  minValue?: number;
  maxValue?: number;
}

export interface SelectProps extends FormProps, FieldValues {
  options: { value: string; label: string; icon?: React.ReactNode }[];
  usePortal?: boolean;
  useLabel?: boolean;
}

export const Input = ({
  label,
  name,
  type,
  onChange,
  value,
  placeholder,
  defaultValue,
  minValue,
  maxValue,
  errors,
  invalid,
}: InputProps) => {
  return (
    <Field.Root my="2" invalid={invalid}>
      <Field.Label htmlFor={name}>{label}</Field.Label>
      <FieldInput
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        {...(type === "number" && { min: minValue ?? 0, max: maxValue ?? Infinity })}
        {...(placeholder && { placeholder })}
        {...(defaultValue && { defaultValue })}
      />
      <Field.ErrorText>{errors?.[name]?.message}</Field.ErrorText>
    </Field.Root>
  );
};

export const Select = ({
  label,
  name,
  options,
  placeholder,
  value,
  onChange,
  errors,
  invalid,
  isMulti,
  usePortal = false,
  useLabel = true,
  width,
  maxW,
  disabled,
}: SelectProps) => {
  const formattedValue = useMemo(() => (Array.isArray(value) ? value : [value]), [value]);
  const collection = useMemo(() => createListCollection({ items: options }), [options]);

  const Positioner = () => {
    return (
      <FieldSelect.Positioner>
        <FieldSelect.Content>
          {collection.items.map((item) => (
            <FieldSelect.Item item={item} key={item.value}>
              <HStack>
                {item.icon}
                {item.label}
              </HStack>
              <FieldSelect.ItemIndicator />
            </FieldSelect.Item>
          ))}
        </FieldSelect.Content>
      </FieldSelect.Positioner>
    );
  };
  return (
    <Field.Root maxW={maxW} width={width} invalid={invalid}>
      {useLabel && <Field.Label htmlFor={name}>{label}</Field.Label>}
      <FieldSelect.Root
        name={name}
        my="2"
        collection={collection}
        multiple={isMulti}
        value={formattedValue}
        onValueChange={(e) => {
          onChange(e.value[0]);
        }}
        disabled={disabled}
      >
        <FieldSelect.HiddenSelect />
        <FieldSelect.Control>
          <FieldSelect.Trigger>
            <HStack w="full" gap="2">
              <FieldSelect.ValueText
                placeholder={placeholder || `Select ${label.toLowerCase()}`}
                flexShrink="0"
              />
              {collection.items.find((item) => item.value === formattedValue[0])?.icon}
            </HStack>
          </FieldSelect.Trigger>
          <FieldSelect.IndicatorGroup>
            <FieldSelect.Indicator />
          </FieldSelect.IndicatorGroup>
        </FieldSelect.Control>
        {usePortal ? (
          <Portal>
            <Positioner />
          </Portal>
        ) : (
          <Positioner />
        )}
      </FieldSelect.Root>
      <Field.ErrorText>{errors?.[name]?.message}</Field.ErrorText>
    </Field.Root>
  );
};

export const GuildSelect = (props: Omit<SelectProps, "name" | "options" | "label" | "isMulti">) => {
  const { currentUser } = useAuth();
  const { defaultGuildId } = useGalleryContext();
  const selectOpts = useMemo(
    () =>
      currentUser?.guilds.map((g) => ({
        value: g.id,
        label: g.name,
        ...(defaultGuildId === g.id
          ? {
              icon: (
                <HStack gap="2">
                  <Icon size="sm">
                    <HiStar fill="yellow" />
                  </Icon>
                  <Text>(Default)</Text>
                </HStack>
              ),
            }
          : {}),
      })) ?? [],
    [currentUser, defaultGuildId],
  );

  if (!currentUser) {
    return <Navigate to="/" replace />;
  }

  return (
    <Select
      name={props.name}
      label="Select a Guild"
      options={selectOpts}
      isMulti={false}
      invalid={props.invalid}
      {...props}
    />
  );
};

export const GallerySelect = (
  props: Omit<SelectProps, "name" | "options" | "label" | "isMulti">,
) => {
  const { data, isLoading, error } = useListGalleries(props.guild);
  const [selectOpts, setSelectOpts] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    if (data && !isLoading && !error) {
      const opts = data.map((g) => ({ value: g.name, label: g.name }));
      setSelectOpts(opts);
      if (opts.length === 1) {
        void props.onChange(opts[0].value);
      }
    }
  }, [data, isLoading, error, props]);

  return (
    <Select
      name={props.name}
      label="Select a Gallery"
      options={selectOpts}
      isMulti={false}
      invalid={props.invalid}
      disabled={isLoading || selectOpts.length === 0}
      {...props}
    />
  );
};
