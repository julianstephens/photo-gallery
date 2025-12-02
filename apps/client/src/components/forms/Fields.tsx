import { useAuth, useGalleryContext, useListGalleries } from "@/hooks";
import { get } from "@/lib/utils";
import {
  createListCollection,
  Field,
  Input as FieldInput,
  Select as FieldSelect,
  HStack,
  Icon,
  Portal,
  Text,
  type JsxStyleProps as ChakraProps,
} from "@chakra-ui/react";
import { useEffect, useMemo, useState } from "react";
import type { FieldError, FieldValues } from "react-hook-form";
import { HiStar } from "react-icons/hi2";
import { Navigate } from "react-router";

export type FormErrors = Record<string, FieldError> | undefined;

interface FieldProps extends ChakraProps {
  label: string;
  name: string;
  invalid: boolean;
  placeholder?: string;
  defaultValue?: string;
  errors?: FormErrors;
  disabled?: boolean;
}

export interface InputProps extends FieldProps, FieldValues {
  type: string;
  minValue?: number;
  maxValue?: number;
  detail?: string;
}

export interface SelectProps extends FieldProps, FieldValues {
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
  detail,
  borderColor,
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
        {...(borderColor && { borderColor })}
      />
      <Field.ErrorText>
        {(get(errors, `${name}.message`) as string | undefined) ?? "Invalid input"}
      </Field.ErrorText>
      {detail && (
        <Text fontSize="xs" color="gray.500" mt="1">
          {detail}
        </Text>
      )}
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
      <Field.ErrorText>
        {(get(errors, `${name}.message`) as string | undefined) ?? "Invalid input"}
      </Field.ErrorText>
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
