const DEFAULT_MAX_GROUPS = 200;
const DEFAULT_MAX_MESSAGES_PER_GROUP = 1_000;

export function createRecentGroupMessages({
  maxGroups = DEFAULT_MAX_GROUPS,
  maxMessagesPerGroup = DEFAULT_MAX_MESSAGES_PER_GROUP,
} = {}) {
  if (!Number.isInteger(maxGroups) || maxGroups < 1) throw new RangeError('maxGroups must be a positive integer');
  if (!Number.isInteger(maxMessagesPerGroup) || maxMessagesPerGroup < 1) {
    throw new RangeError('maxMessagesPerGroup must be a positive integer');
  }

  const groups = new Map();

  function touch(groupJid, messages) {
    groups.delete(groupJid);
    groups.set(groupJid, messages);
  }

  function add(groupJid, messageKey) {
    if (!groupJid || !messageKey) return;
    const messages = groups.get(groupJid) || [];
    messages.push(messageKey);
    if (messages.length > maxMessagesPerGroup) {
      messages.splice(0, messages.length - maxMessagesPerGroup);
    }
    touch(groupJid, messages);
    while (groups.size > maxGroups) groups.delete(groups.keys().next().value);
  }

  function get(groupJid) {
    const messages = groups.get(groupJid);
    if (!messages) return [];
    touch(groupJid, messages);
    return messages;
  }

  return { add, get, get size() { return groups.size; } };
}
