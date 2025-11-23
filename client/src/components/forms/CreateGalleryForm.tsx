import { queryClient } from "@/clients";
import { Input } from "@/components/forms/Fields";
import { useAuth } from "@/hooks";
import { createGallery } from "@/queries";
import { toErrorMessage } from "@/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import React, { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { Navigate } from "react-router";
import { type CreateGalleryRequest, createGallerySchema } from "utils";
import { toaster } from "../ui/toaster";

export interface CreateGalleryFormProps {
  doSubmit: boolean;
  setDoSubmit: (value: boolean) => void;
  closeModal: () => void;
  guildId: string;
}

export const CreateGalleryForm = ({
  doSubmit,
  setDoSubmit,
  closeModal,
  guildId,
}: CreateGalleryFormProps) => {
  const { currentUser } = useAuth();
  const {
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<CreateGalleryRequest>({
    resolver: zodResolver(createGallerySchema),
    defaultValues: {
      galleryName: "",
      guildId: guildId,
      ttlWeeks: 1,
    },
  });

  const createGalleryMutation = useMutation({
    mutationFn: createGallery,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["galleries", { guildId }],
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
  }, [doSubmit, setDoSubmit, errors]);

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
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              field.onChange(parseInt(e.target.value))
            }
          />
        )}
      />
    </form>
  );
};
