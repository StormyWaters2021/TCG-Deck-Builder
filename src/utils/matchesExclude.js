export function matchesExclude(card, exclude, groupName = null) {
  if (!exclude) return false;

  // Standardize groupName (trim, lowercase)
  const normalizedGroupName = groupName ? groupName.trim().toLowerCase() : null;

  // Exclude by group (normalize all group names for comparison)
  if (exclude.group) {
    for (const excludeGroup of exclude.group) {
      if (normalizedGroupName === excludeGroup.trim().toLowerCase()) {
        console.log(`[MATCHES EXCLUDE] Card: ${card?.name}, Group: ${groupName}, Excluding: ${excludeGroup}`);
        return true;
      }
    }
  }
  // Exclude by property
  if (exclude.property && typeof exclude.property === "object") {
    for (const [prop, val] of Object.entries(exclude.property)) {
      if (card[prop] === val) return true;
    }
  }
  return false;
}