import { queryClient } from "@/clients";
import { useGalleryContext } from "@/hooks";
import type { FormProps } from "@/lib/types";
import { toErrorMessage } from "@/lib/utils";
import { renameGallery } from "@/queries";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { updateGalleryNameSchema, type UpdateGalleryNameRequest } from "utils";
import { toaster } from "@/components/ui/toaster";
import { Input } from "./Fields";

export const RenameGalleryForm = ({
  guildId,
  closeModal,
  setLoading,
  doSubmit,
  setDoSubmit,
  galleryName,
}: FormProps & { galleryName: string }) => {
  const { updateGalleryName } = useGalleryContext();
  const {
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<UpdateGalleryNameRequest>({
    resolver: zodResolver(updateGalleryNameSchema),
    defaultValues: {
      galleryName: galleryName,
      newGalleryName: "",
      guildId: guildId,
    },
  });

  const renameGalleryMutation = useMutation({
    mutationFn: renameGallery,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["galleries", { guildId }] });
    },
  });

  const onSubmit = async (data: UpdateGalleryNameRequest) => {
    setLoading(true);
    try {
      await renameGalleryMutation.mutateAsync(data);
      // Update the context with the new gallery name
      updateGalleryName(data.galleryName, data.newGalleryName);
      // Invalidate the old gallery items query with old name
      await queryClient.invalidateQueries({
        queryKey: ["galleryItems", { guildId, galleryName: data.galleryName }],
      });
      // Invalidate the new gallery items query with new name
      await queryClient.invalidateQueries({
        queryKey: ["galleryItems", { guildId, galleryName: data.newGalleryName }],
      });
      toaster.success({ title: "Gallery renamed successfully" });
    } catch (error) {
      toaster.error({ title: "Error renaming gallery", description: toErrorMessage(error) });
    } finally {
      setLoading(false);
      closeModal();
    }
  };

  useEffect(() => {
    if (!doSubmit) return;
    setDoSubmit(false);
    const form = document.getElementById("rename-gallery-form");
    form?.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
  }, [doSubmit, setDoSubmit, errors]);

  return (
    <form id="rename-gallery-form" onSubmit={handleSubmit(onSubmit)}>
      <Controller
        name="newGalleryName"
        control={control}
        render={({ field }) => (
          <Input
            label="New Gallery Name"
            type="text"
            placeholder="Enter new gallery name"
            invalid={!!errors.newGalleryName}
            {...field}
          />
        )}
      />
    </form>
  );
};
