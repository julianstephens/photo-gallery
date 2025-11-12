import { queryClient } from "@/clients";
import { GuildSelect, Input } from "@/components/forms/Fields";
import { useAuth } from "@/hooks";
import { createGallery } from "@/queries";
import { getGuildIdFromUser, toErrorMessage } from "@/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { Navigate } from "react-router";
import { type CreateGalleryRequest, createGallerySchema } from "utils";
import { toaster } from "../ui/toaster";

export const CreateGalleryForm = ({
  doSubmit,
  setDoSubmit,
  closeModal,
}: {
  doSubmit: boolean;
  setDoSubmit: (value: boolean) => void;
  closeModal: () => void;
}) => {
  const { currentUser } = useAuth();
  const {
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<CreateGalleryRequest>({
    resolver: zodResolver(createGallerySchema),
    defaultValues: {
      galleryName: "",
      guildId: "",
      ttlWeeks: 1,
    },
  });

  const createGalleryMutation = useMutation({
    mutationFn: createGallery,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["galleries", { guildId: getGuildIdFromUser(currentUser) }],
      });
    },
  });

  const isAuthenticated = Boolean(currentUser);

  const onSubmit = async (data: CreateGalleryRequest) => {
    try {
      await createGalleryMutation.mutateAsync(data);
      toaster.success({ title: "Gallery created successfully" });
      closeModal();
    } catch (error) {
      toaster.error({ title: "Error creating gallery", description: toErrorMessage(error) });
    }
  };

  useEffect(() => {
    if (!doSubmit) return;
    setDoSubmit(false);
    const form = document.getElementById("create-gallery-form");
    form?.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
  }, [doSubmit, setDoSubmit]);

  return (
    <form id="create-gallery-form" onSubmit={handleSubmit(onSubmit)}>
      {!isAuthenticated && <Navigate to="/" replace />}
      <Controller
        name="galleryName"
        control={control}
        render={({ field }) => (
          <Input
            label="Gallery Name"
            type="text"
            placeholder="Enter gallery name"
            invalid={!!errors.galleryName}
            {...field}
          />
        )}
      />
      <Controller
        name="guildId"
        control={control}
        render={({ field }) => <GuildSelect {...field} invalid={!!errors.guildId} />}
      />
      <Controller
        name="ttlWeeks"
        control={control}
        render={({ field }) => (
          <Input
            label="TTL Weeks"
            type="number"
            minValue={1}
            maxValue={6}
            invalid={!!errors.ttlWeeks}
            {...field}
          />
        )}
      />
    </form>
  );
};
