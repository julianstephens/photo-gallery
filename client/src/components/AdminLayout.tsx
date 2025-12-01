import { Heading, HStack, IconButton, SegmentGroup, Text, VStack } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { HiOutlineHome } from "react-icons/hi2";
import { Outlet, useLocation, useNavigate } from "react-router";
import { Tooltip } from "./ui/tooltip";

type Tab = "Photo Galleries" | "Requests";

export const AdminLayout = () => {
  const [tabs] = useState<Tab[]>(["Photo Galleries", "Requests"]);
  const [activeTab, setActiveTab] = useState<Tab>(tabs[0]);
  const goto = useNavigate();
  const loc = useLocation();

  const pageTitle = "Admin Dashboard";
  const prefix = "admin";

  const updateTab = (tab: Tab) => {
    if (tab === "Photo Galleries") goto("/admin");
    else goto(`/admin/${tab.toLowerCase().replace(/\s+/g, "-")}`);
  };

  useEffect(() => {
    if (loc.pathname.includes("requests")) {
      setActiveTab("Requests");
    } else {
      setActiveTab("Photo Galleries");
    }
  }, [loc]);

  return (
    <VStack id={`${prefix}-layout`} w="full" h="full" gap="6">
      <HStack id={`${prefix}-header`} w="full" align="center" justify="space-between">
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
      <HStack id={`${prefix}-tabs`} w="full">
        <SegmentGroup.Root
          value={activeTab}
          onValueChange={(details) => updateTab(details.value as unknown as Tab)}
        >
          <SegmentGroup.Indicator />
          <SegmentGroup.Items items={tabs} />
        </SegmentGroup.Root>
      </HStack>
      <Outlet />
    </VStack>
  );
};
