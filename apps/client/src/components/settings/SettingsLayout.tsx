import { Box, Heading, HStack, Text, VStack } from "@chakra-ui/react";
import type { ReactNode } from "react";

export interface SettingsTab {
  id: string;
  label: string;
  content: ReactNode;
}

interface SettingsLayoutProps {
  title: string;
  description?: string;
  tabs: SettingsTab[];
  activeTabId: string;
  onTabChange: (tabId: string) => void;
  backPath?: string;
}

/**
 * Reusable settings layout with sidebar navigation.
 * Designed to be extendable with additional settings sections.
 */
export const SettingsLayout = ({
  title,
  description,
  tabs,
  activeTabId,
  onTabChange,
}: SettingsLayoutProps) => {
  const componentIdentifier = "settings-layout";

  return (
    <VStack id={`${componentIdentifier}-container`} w="full" h="full" gap="6" align="stretch">
      <HStack id={`${componentIdentifier}-header`} w="full" justify="space-between" align="center">
        <VStack align="start" gap="0">
          <Heading size="lg">{title}</Heading>
          {description && (
            <Text fontSize="sm" color="gray.500">
              {description}
            </Text>
          )}
        </VStack>
      </HStack>

      <HStack id={`${componentIdentifier}-main`} w="full" h="full" align="stretch" gap="6">
        <VStack
          id={`${componentIdentifier}-sidebar`}
          w="220px"
          minW="200px"
          align="stretch"
          gap="1"
          p="4"
          bg="gray.900"
          borderRadius="md"
        >
          <Text fontSize="xs" fontWeight="bold" color="gray.500" mb="2" textTransform="uppercase">
            Settings
          </Text>
          {tabs.map((tab) => (
            <Box
              key={tab.id}
              as="button"
              w="full"
              px="3"
              py="2"
              borderRadius="md"
              textAlign="left"
              bg={activeTabId === tab.id ? "gray.700" : "transparent"}
              color={activeTabId === tab.id ? "white" : "gray.400"}
              fontWeight={activeTabId === tab.id ? "medium" : "normal"}
              _hover={{
                bg: activeTabId === tab.id ? "gray.700" : "gray.800",
                color: "white",
              }}
              transition="all 0.2s"
              onClick={() => onTabChange(tab.id)}
            >
              {tab.label}
            </Box>
          ))}
        </VStack>

        <Box
          id={`${componentIdentifier}-content`}
          flex="1"
          p="6"
          bg="gray.900"
          borderRadius="md"
          overflow="auto"
        >
          {tabs.find((tab) => tab.id === activeTabId)?.content}
        </Box>
      </HStack>
    </VStack>
  );
};
