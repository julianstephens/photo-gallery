import { Button, ButtonGroup, Collapsible, Heading, List, VStack } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { HiChevronDown } from "react-icons/hi2";
import { type GuildSettings, guildSettingsSchema } from "utils";
import { Input } from "./Fields";

interface NotificationSettingsFormProps {
  settings: GuildSettings;
  onSettingsChange: (settings: GuildSettings) => void;
}

export const NotificationSettingsForm = ({
  settings,
  onSettingsChange,
}: NotificationSettingsFormProps) => {
  const {
    control,
    formState: { errors },
    handleSubmit,
    reset,
  } = useForm<GuildSettings>({
    resolver: zodResolver(guildSettingsSchema),
    defaultValues: {
      ...settings,
      notifications: {
        ...settings.notifications,
        galleryExpiration: {
          ...settings.notifications.galleryExpiration,
        },
      },
    },
    mode: "onChange",
  });

  const onSubmit = (data: GuildSettings) => {
    onSettingsChange(data);
  };

  useEffect(() => {
    reset(settings, { keepDirtyValues: true });
  }, [settings, reset]);

  return (
    <VStack id="notification-settings-form" onSubmit={handleSubmit(onSubmit)} as="form">
      <Collapsible.Root alignSelf="center">
        <Collapsible.Trigger
          mx="auto"
          mb="2"
          display="flex"
          alignItems="center"
          gap="4"
          cursor="pointer"
        >
          <Collapsible.Indicator
            transition="transform 0.2s"
            _open={{ transform: "rotate(180deg)" }}
          >
            <HiChevronDown />
          </Collapsible.Indicator>
          View Webhook Setup Instructions
        </Collapsible.Trigger>
        <Collapsible.Content border="1px solid" borderColor="gray.600" borderRadius="md">
          <VStack px="10" py="2">
            <Heading size="md">How to get a Discord Webhook URL</Heading>
            <List.Root as="ol">
              <List.Item>
                In your Discord server, go to{" "}
                <span style={{ fontWeight: "bold" }}>Server Settings</span> &gt;{" "}
                <span style={{ fontWeight: "bold" }}>Integrations</span>. (
                <span style={{ fontStyle: "italic" }}>
                  You must have the &quot;Manage Webhooks&quot; permission to do this.
                </span>
                )
              </List.Item>
              <List.Item>
                Click the &apos;<span style={{ fontWeight: "bold" }}>Create Webhook</span>&apos;
                button
              </List.Item>
              <List.Item>Customize your new webhook:</List.Item>
              <List.Root ps="5" as="ul">
                <List.Item>
                  Give it a descriptive name (e.g., &quot;Gallery Notifications&quot;).
                </List.Item>
                <List.Item>Choose the channel where you want notifications to be sent.</List.Item>
              </List.Root>
              <List.Item>
                Click the &apos;<span style={{ fontWeight: "bold" }}>Copy Webhook URL</span>&apos;
                button, then paste it here.
              </List.Item>
            </List.Root>
          </VStack>
        </Collapsible.Content>
      </Collapsible.Root>
      <Controller
        name="notifications.galleryExpiration.webhookUrl"
        control={control}
        render={({ field }) => (
          <Input
            label="Notification Webhook URL"
            type="text"
            placeholder="Enter the webhook URL for notifications"
            invalid={!!errors.notifications?.galleryExpiration?.webhookUrl}
            detail="Discord webhook URL where expiration notifications will be sent."
            {...field}
            borderColor="gray.600"
          />
        )}
      />
      <Controller
        name="notifications.galleryExpiration.daysBefore"
        control={control}
        render={({ field }) => (
          <Input
            label="Days Before Expiration"
            type="number"
            invalid={!!errors.notifications?.galleryExpiration?.daysBefore}
            detail="Number of days before a gallery expires to send a notification."
            {...field}
            borderColor="gray.600"
          />
        )}
      />
      <ButtonGroup ml="auto" mt="4">
        <Button type="button" variant="outline" onClick={() => reset(settings)}>
          Reset
        </Button>
        <Button type="submit" colorPalette="blue">
          Save
        </Button>
      </ButtonGroup>
    </VStack>
  );
};
