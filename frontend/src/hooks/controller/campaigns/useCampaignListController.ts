import { useMemo, useState } from "react";
import type { CampaignData, Category, DropdownType } from "../../../types";

const PAGE_SIZE = 8;

type Params = {
  campaigns: CampaignData[];
  categories: Category[];
};

export function useCampaignListController({ campaigns, categories }: Params) {
  const [searchName, setSearchName] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [openDropdown, setOpenDropdown] = useState<DropdownType>(null);

  const filteredCampaigns = useMemo(() => {
    const normalizedName = searchName.trim().toLowerCase();

    return campaigns.filter((campaign) => {
      const matchName = (campaign.name ?? "")
        .toLowerCase()
        .includes(normalizedName);
      const matchCategory =
        !categoryFilter || campaign.category?.name === categoryFilter;

      return matchName && matchCategory;
    });
  }, [campaigns, searchName, categoryFilter]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredCampaigns.length / PAGE_SIZE)),
    [filteredCampaigns.length]
  );

  const safePage = Math.min(page, totalPages);

  const paginatedCampaigns = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredCampaigns.slice(start, start + PAGE_SIZE);
  }, [filteredCampaigns, safePage]);

  const toggleDropdown = (type: DropdownType) => {
    setOpenDropdown((prev) => (prev === type ? null : type));
  };

  const selectCategory = (categoryName: string | null) => {
    setCategoryFilter(categoryName);
    setPage(1);
    setOpenDropdown(null);
  };

  const updateSearch = (value: string) => {
    setSearchName(value);
    setPage(1);
  };

  return {
    categories,
    filteredCampaigns,
    searchName,
    categoryFilter,
    page: safePage,
    totalPages,
    paginatedCampaigns,
    openDropdown,
    setPage,
    updateSearch,
    selectCategory,
    toggleDropdown,
  };
}

