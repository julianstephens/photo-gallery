import { queryClient } from "@/clients";
import { DetailedGallery } from "@/components/DetailedGallery";
import { GuildSelect } from "@/components/forms/Fields";
import { GalleryList } from "@/components/GalleryList";
import { ConfirmDeleteModal } from "@/components/modals/ConfirmDelete";
import { CreateGalleryModal } from "@/components/modals/CreateGalleryModal";
import { SetDefaultGuildButton } from "@/components/SetDefaultGuild";
import { toaster } from "@/components/ui/toaster";
import { Tooltip } from "@/components/ui/tooltip";
import { UploadMonitor } from "@/components/UploadMonitor";
import { useDefaultGuild, useListGalleries } from "@/hooks";
import { getAllUploadJobs } from "@/lib/upload/uploadService";
import { removeGallery } from "@/queries";
import { Flex, Heading, HStack, Icon, IconButton, Presence, Text, VStack } from "@chakra-ui/react";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { HiOutlineHome } from "react-icons/hi";
import { HiStar } from "react-icons/hi2";
import { useNavigate } from "react-router";
import type { Gallery, UploadJob } from "utils";

const AdminDashboard = () => {
  const [guildId, setGuildId] = useState<string | undefined>(undefined);
  const { data, error, isLoading } = useListGalleries(guildId);
  const defaultGuild = useDefaultGuild();
  const [showCreateGalleryModal, setShowCreateGalleryModal] = useState(false);
  const [showConfirmDeleteModal, setShowConfirmDeleteModal] = useState(false);
  const [deleteKey, setDeleteKey] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [guild, setGuild] = useState<string>("");
  const [uploadJobs, setUploadJobs] = useState<UploadJob[]>([]);
  const [showUploadMonitor, setShowUploadMonitor] = useState(false);
  const [galleryOpened, setGalleryOpened] = useState(false);
  const [openedGallery, setOpenedGallery] = useState<Gallery | null>(null);

  const goto = useNavigate();

  const pageTitle = "Admin Dashboard";
  const pageSlug = pageTitle.toLowerCase().replace(/\s+/g, "-").toLowerCase();

  const deleteGalleryMutation = useMutation({
    mutationFn: removeGallery,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["galleries", { guildId }] });
    },
  });

  const openCreateGalleryModal = () => {
    setShowCreateGalleryModal(true);
  };

  const closeCreateGalleryModal = () => {
    setShowCreateGalleryModal(false);
  };

  const openConfirmDeleteModal = (gallery: string) => {
    setDeleteKey(gallery);
    setShowConfirmDeleteModal(true);
  };

  const closeConfirmDeleteModal = () => {
    setShowConfirmDeleteModal(false);
  };

  const handleUploadMonitorClose = () => {
    setShowUploadMonitor(false);
  };

  const openDetailedGalleryView = (gallery: Gallery) => {
    console.log("Opening gallery:", gallery); // Debug log
    setOpenedGallery(gallery);
    setGalleryOpened(true);
  };

  const closeDetailedGalleryView = () => {
    setOpenedGallery(null);
    setGalleryOpened(false);
  };

  // Fetch upload jobs when monitor is shown
  useEffect(() => {
    if (!showUploadMonitor) return;

    const fetchJobs = async () => {
      try {
        const jobs = await getAllUploadJobs();
        setUploadJobs(jobs);
      } catch (error) {
        console.error("Failed to fetch upload jobs:", error);
      }
    };

    // Initial fetch
    fetchJobs();

    // Poll every 2 seconds
    const interval = setInterval(fetchJobs, 2000);

    return () => clearInterval(interval);
  }, [showUploadMonitor]);

  // Calculate upload job statistics
  const activeUploads = uploadJobs.filter(
    (job) => job.status === "pending" || job.status === "processing",
  ).length;
  const totalJobs = uploadJobs.length;

  const handleUploadJobCreated = (jobId: string) => {
    console.log("Upload job created with ID:", jobId);
    // Show the monitor and it will fetch jobs
    setShowUploadMonitor(true);
  };

  const deleteGallery = async () => {
    if (!guildId || !deleteKey) {
      toaster.error({
        title: "Deletion Error",
        description: "Guild ID or Gallery Name is missing.",
      });
      return;
    }

    try {
      setDeleteLoading(true);
      await deleteGalleryMutation.mutateAsync({
        guildId: guildId ?? "",
        galleryName: deleteKey,
      });
      toaster.success({
        title: "Gallery Deleted",
        description: `Gallery "${deleteKey}" has been deleted.`,
      });
    } catch (err) {
      console.error("Error deleting gallery:", err);
      toaster.error({
        title: "Deletion Error",
        description: `Failed to delete gallery "${deleteKey}".`,
      });
    } finally {
      setDeleteLoading(false);
    }
  };

  const onGuildChange = (selectedGuild: string) => {
    setGuild(selectedGuild);
    setGuildId(selectedGuild);
  };

  useEffect(() => {
    if (defaultGuild) {
      setGuild(defaultGuild);
      setGuildId(defaultGuild);
    }
  }, [defaultGuild]);

  return (
    <>
      <Flex id={pageSlug} direction="column" height="full" gap="6">
        <HStack id={`${pageSlug}-header`} align="center" justify="space-between">
          <VStack align="start" gap="0">
            <Heading size="lg">{pageTitle}</Heading>
            <Text fontSize="sm" color="gray.500">
              Welcome to the admin dashboard. Here you can manage the application.
            </Text>
          </VStack>
          <Tooltip content="Home">
            <IconButton
              variant="ghost"
              size="xl"
              aria-label="Home"
              onClick={() => {
                goto("/");
              }}
            >
              <HiOutlineHome />
            </IconButton>
          </Tooltip>
        </HStack>
        <HStack
          id={`${pageSlug}-guild-select`}
          gap="4"
          w="full"
          align="center"
          backgroundColor="gray.900"
          p="4"
          borderRadius="md"
        >
          <VStack w="full" align="start">
            <HStack w="full" justify="space-between" align="last baseline" gap="4">
              <GuildSelect
                w="50%"
                defaultGuild={defaultGuild ?? undefined}
                value={guild}
                onChange={onGuildChange}
              />
              <SetDefaultGuildButton defaultGuild={guild} disabled={defaultGuild === guild} />
            </HStack>
            {defaultGuild === guild && (
              <HStack>
                <Icon fill="green.400">
                  <HiStar />
                </Icon>
                <Text fontSize="sm" color="green.400">
                  This is your default guild
                </Text>
              </HStack>
            )}
          </VStack>
        </HStack>
        <Presence present={!galleryOpened}>
          <GalleryList
            data={data || undefined}
            error={error}
            isLoading={isLoading}
            guildId={guildId}
            deleteLoading={deleteLoading}
            deleteKey={deleteKey}
            openConfirmDeleteModal={openConfirmDeleteModal}
            handleUploadJobCreated={handleUploadJobCreated}
            openCreateGalleryModal={openCreateGalleryModal}
            openDetailedGalleryView={openDetailedGalleryView}
            uploadJobs={uploadJobs}
            showUploadMonitor={showUploadMonitor}
            setShowUploadMonitor={setShowUploadMonitor}
            activeUploads={activeUploads}
            totalJobs={totalJobs}
            pageSlug={pageSlug}
          />
        </Presence>
        {galleryOpened && openedGallery && (
          <DetailedGallery
            gallery={openedGallery}
            guildId={guild}
            pageSlug={pageSlug}
            closeGallery={closeDetailedGalleryView}
          />
        )}
      </Flex>
      <CreateGalleryModal
        guildId={guildId ?? ""}
        open={showCreateGalleryModal}
        closeModal={closeCreateGalleryModal}
      />
      <ConfirmDeleteModal
        open={showConfirmDeleteModal}
        closeModal={closeConfirmDeleteModal}
        actionButtonLoading={deleteLoading && deleteKey !== null}
        actionButtonOnClick={deleteGallery}
      />
      <UploadMonitor
        jobs={uploadJobs}
        isOpen={showUploadMonitor}
        onClose={handleUploadMonitorClose}
      />
    </>
  );
};

export default AdminDashboard;
