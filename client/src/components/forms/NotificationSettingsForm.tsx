import { Button, ButtonGroup, VStack } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
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
          channelId: settings.notifications.galleryExpiration.channelId ?? "",
        },
      },
    },
    mode: "onChange",
  });

  const onSubmit = (data: GuildSettings) => {
    onSettingsChange(data);
  };

  useEffect(() => {
    reset(settings);
  }, [settings, reset]);

  return (
    <VStack id="notification-settings-form" onSubmit={handleSubmit(onSubmit)} as="form">
      <Controller
        name="notifications.galleryExpiration.channelId"
        control={control}
        render={({ field }) => (
          <Input
            label="Notification Channel ID"
            type="text"
            placeholder="Enter the channel ID for notifications"
            invalid={!!errors.notifications?.galleryExpiration?.channelId}
            detail="Discord channel ID where expiration notifications will be sent."
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
