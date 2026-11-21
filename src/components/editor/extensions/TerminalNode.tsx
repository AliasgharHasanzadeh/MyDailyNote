import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import {
  Check,
  ChevronRight,
  Copy,
  Eraser,
  Pencil,
  Plus,
  Terminal as TerminalIcon,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export type ShellFlavor = 'bash' | 'zsh' | 'kali' | 'pwsh';

export interface TerminalEntry {
  id: string;
  command: string;
  output: string;
}

const SHELL_PROMPTS: Record<ShellFlavor, string> = {
  bash: 'user@vellum:~$',
  zsh: 'vellum% ',
  kali: 'root@kali:~#',
  pwsh: 'PS C:\\Workspace>',
};

const VIRTUAL_FILES: Record<string, string> = {
  'README.md':
    '# Vellum Notes Workspace\nLocal-first notebook with encrypted Google Drive sync, daily journal, and tasks.',
  'notes.txt':
    'Checklist:\n- Review firewall ingress rules\n- Verify TLS 1.3 certificate expiry\n- Backup workspace snapshot',
  'network.conf':
    'interface eth0\n  address 10.24.0.15/24\n  gateway 10.24.0.1\n  dns-nameservers 1.1.1.1 9.9.9.9',
};

function runSimulatedCommand(raw: string, shell: ShellFlavor): { output: string; clear?: boolean } {
  const trimmed = raw.trim();
  if (!trimmed) return { output: '' };

  const parts = trimmed.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);
  const argStr = args.join(' ');

  if (cmd === 'clear' || cmd === 'cls') {
    return { output: '', clear: true };
  }

  if (cmd === 'help') {
    return {
      output: [
        'Simulated Terminal Commands:',
        '  help                  Show this command reference',
        '  clear                 Clear terminal history',
        '  whoami / id / pwd     User & working directory info',
        '  ls [-la]              List virtual workspace files',
        '  cat <file>            Inspect README.md, notes.txt, or network.conf',
        '  echo <text>           Print text to stdout',
        '  date / uname -a       Timestamp & kernel summary',
        '  ip a / ifconfig       Show simulated network interfaces',
        '  ping <host>           Simulated ICMP reachability check',
        '  dig <domain>          Simulated DNS A/AAAA/MX lookup',
        '  traceroute <host>     Simulated 4-hop route trace',
        '  nmap <target>         Simulated common port scan summary',
        '  ss -tulnp             Simulated listening sockets table',
        '  curl -I <url>         Simulated HTTP response headers',
        '',
        'Tip: Any custom command is also saved — click Edit on any entry to attach real output.',
      ].join('\n'),
    };
  }

  if (cmd === 'whoami') {
    return { output: shell === 'kali' ? 'root' : 'vellum-user' };
  }

  if (cmd === 'id') {
    return {
      output:
        shell === 'kali'
          ? 'uid=0(root) gid=0(root) groups=0(root)'
          : 'uid=1000(vellum-user) gid=1000(vellum-user) groups=1000(vellum-user),27(sudo)',
    };
  }

  if (cmd === 'pwd') {
    return { output: shell === 'pwsh' ? 'C:\\Workspace\\Vellum' : '/home/vellum/workspace' };
  }

  if (cmd === 'date') {
    return { output: new Date().toUTCString() };
  }

  if (cmd === 'uname') {
    return {
      output: argStr.includes('-a')
        ? 'Linux vellum-lab 6.8.0-45-generic #45-Ubuntu SMP PREEMPT_DYNAMIC x86_64 GNU/Linux'
        : 'Linux',
    };
  }

  if (cmd === 'echo') {
    return { output: argStr.replace(/^["']|["']$/g, '') };
  }

  if (cmd === 'ls' || cmd === 'dir') {
    if (argStr.includes('-l') || argStr.includes('-a')) {
      return {
        output: [
          'total 16',
          'drwxr-xr-x  2 vellum vellum 4096 Nov 21 09:00 .',
          '-rw-r--r--  1 vellum vellum  118 Nov 21 08:42 README.md',
          '-rw-r--r--  1 vellum vellum  104 Nov 21 08:50 notes.txt',
          '-rw-r-----  1 vellum vellum   98 Nov 21 08:55 network.conf',
        ].join('\n'),
      };
    }
    return { output: 'README.md   notes.txt   network.conf' };
  }

  if (cmd === 'cat' || cmd === 'type') {
    const file = args[0];
    if (!file) return { output: 'usage: cat <filename>' };
    if (VIRTUAL_FILES[file]) return { output: VIRTUAL_FILES[file] };
    return { output: `cat: ${file}: No such file in virtual sandbox` };
  }

  if ((cmd === 'ip' && (args[0] === 'a' || args[0] === 'addr')) || cmd === 'ifconfig') {
    return {
      output: [
        '1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 state UNKNOWN',
        '    inet 127.0.0.1/8 scope host lo',
        '2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 state UP',
        '    inet 10.24.0.15/24 brd 10.24.0.255 scope global eth0',
        '    inet6 fe80::42:acff:fe11:2/64 scope link',
      ].join('\n'),
    };
  }

  if (cmd === 'ping') {
    const host = args[0] || '1.1.1.1';
    return {
      output: [
        `PING ${host} (${host === 'localhost' ? '127.0.0.1' : '93.184.216.34'}): 56 data bytes`,
        `64 bytes from ${host}: icmp_seq=0 ttl=57 time=11.4 ms`,
        `64 bytes from ${host}: icmp_seq=1 ttl=57 time=10.8 ms`,
        `64 bytes from ${host}: icmp_seq=2 ttl=57 time=11.1 ms`,
        `--- ${host} ping statistics ---`,
        '3 packets transmitted, 3 received, 0% packet loss, rtt min/avg/max = 10.8/11.1/11.4 ms',
      ].join('\n'),
    };
  }

  if (cmd === 'traceroute' || cmd === 'tracert') {
    const host = args[0] || 'example.com';
    return {
      output: [
        `traceroute to ${host}, 30 hops max, 60 byte packets`,
        ' 1  gateway (10.24.0.1)  1.12 ms  0.98 ms  1.05 ms',
        ' 2  isp-core-gw.net (172.16.12.1)  6.41 ms  6.19 ms  6.32 ms',
        ` 3  edge-router.${host} (93.184.216.1)  11.04 ms  10.92 ms  11.15 ms`,
        ` 4  ${host} (93.184.216.34)  11.38 ms  11.20 ms  11.29 ms`,
      ].join('\n'),
    };
  }

  if (cmd === 'dig' || cmd === 'nslookup') {
    const domain = args.find((a) => !a.startsWith('-')) || 'example.com';
    return {
      output: [
        `; <<>> DiG Simulator <<>> ${domain}`,
        ';; ANSWER SECTION:',
        `${domain}.        300   IN   A      93.184.216.34`,
        `${domain}.        300   IN   AAAA   2606:2800:220:1:248:1893:25c8:1946`,
        ';; Query time: 14 msec (simulated)',
      ].join('\n'),
    };
  }

  if (cmd === 'nmap') {
    const target = args.find((a) => !a.startsWith('-')) || '10.24.0.15';
    return {
      output: [
        `Starting Nmap Simulator on ${target}`,
        'PORT     STATE SERVICE  VERSION',
        '22/tcp   open  ssh      OpenSSH 9.6p1',
        '80/tcp   open  http     nginx 1.24.0',
        '443/tcp  open  https    TLSv1.3',
        'Nmap done: 1 IP address (1 host up) — simulated lab output',
      ].join('\n'),
    };
  }

  if (cmd === 'ss' || cmd === 'netstat') {
    return {
      output: [
        'Netid  State   Local Address:Port   Peer Address:Port   Process',
        'tcp    LISTEN  0.0.0.0:22           0.0.0.0:*           sshd',
        'tcp    LISTEN  127.0.0.1:3000       0.0.0.0:*           node',
        'tcp    LISTEN  0.0.0.0:443          0.0.0.0:*           nginx',
      ].join('\n'),
    };
  }

  if (cmd === 'curl') {
    const url = args.find((a) => !a.startsWith('-')) || 'https://example.com';
    return {
      output: [
        `HTTP/2 200 (simulated response for ${url})`,
        'content-type: text/html; charset=utf-8',
        'strict-transport-security: max-age=31536000; includeSubDomains',
        'x-content-type-options: nosniff',
      ].join('\n'),
    };
  }

  return {
    output: `[simulated shell] '${trimmed}' recorded. Click Edit on this entry to paste or customize real command output.`,
  };
}

function TerminalBlockView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const shell = ((node.attrs.shell as ShellFlavor) || 'bash') as ShellFlavor;
  const prompt = (node.attrs.prompt as string) || SHELL_PROMPTS[shell];
  const title = (node.attrs.title as string) || 'Terminal Simulator';
  const entries = Array.isArray(node.attrs.entries)
    ? (node.attrs.entries as TerminalEntry[])
    : [];

  const [cmdInput, setCmdInput] = useState('');
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customCmd, setCustomCmd] = useState('');
  const [customOut, setCustomOut] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setHistoryIndex(-1);
  }, [entries.length]);

  const handleRunCommand = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = cmdInput.trim();
    if (!trimmed) return;

    const result = runSimulatedCommand(trimmed, shell);
    if (result.clear) {
      updateAttributes({ entries: [] });
      setCmdInput('');
      return;
    }

    const nextEntry: TerminalEntry = {
      id: `term_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      command: trimmed,
      output: result.output,
    };
    updateAttributes({ entries: [...entries, nextEntry] });
    setCmdInput('');
  };

  const handleAddCustomSnippet = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customCmd.trim() && !customOut.trim()) return;
    const nextEntry: TerminalEntry = {
      id: `term_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      command: customCmd.trim() || '# output',
      output: customOut.trim(),
    };
    updateAttributes({ entries: [...entries, nextEntry] });
    setCustomCmd('');
    setCustomOut('');
    setCustomOpen(false);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      if (entries.length === 0) return;
      e.preventDefault();
      const nextIdx = historyIndex === -1 ? entries.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIdx);
      setCmdInput(entries[nextIdx]?.command || '');
    } else if (e.key === 'ArrowDown') {
      if (historyIndex === -1) return;
      e.preventDefault();
      if (historyIndex >= entries.length - 1) {
        setHistoryIndex(-1);
        setCmdInput('');
      } else {
        const nextIdx = historyIndex + 1;
        setHistoryIndex(nextIdx);
        setCmdInput(entries[nextIdx]?.command || '');
      }
    }
  };

  const handleShellChange = (nextShell: ShellFlavor) => {
    updateAttributes({
      shell: nextShell,
      prompt: SHELL_PROMPTS[nextShell],
    });
  };

  const handleUpdateEntry = (id: string, patch: Partial<TerminalEntry>) => {
    updateAttributes({
      entries: entries.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    });
  };

  const handleRemoveEntry = (id: string) => {
    updateAttributes({
      entries: entries.filter((entry) => entry.id !== id),
    });
  };

  const handleCopyAll = async () => {
    const text = entries
      .map((entry) => `${prompt} ${entry.command}${entry.output ? `\n${entry.output}` : ''}`)
      .join('\n\n');
    try {
      await navigator.clipboard.writeText(text || prompt);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1600);
    } catch {
      // ignore clipboard restrictions
    }
  };

  const handleCopyEntry = async (entry: TerminalEntry) => {
    try {
      await navigator.clipboard.writeText(entry.command);
      setCopiedId(entry.id);
      setTimeout(() => setCopiedId(null), 1400);
    } catch {
      // ignore
    }
  };

  return (
    <NodeViewWrapper
      dir="ltr"
      data-type="terminalBlock"
      className={`group my-4 overflow-hidden rounded-xl border bg-[#070c12] text-[#d8f3e8] shadow-sm transition-shadow ${
        selected
          ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/25'
          : 'border-[#1d2c38]'
      }`}
    >
      {/* Terminal Window Top Bar */}
      <div
        contentEditable={false}
        className="flex flex-wrap items-center justify-between gap-2 border-b border-[#182530] bg-[#0c141d] px-3.5 py-2 select-none"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]/85" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]/85" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]/85" />
          </div>
          <TerminalIcon className="h-3.5 w-3.5 shrink-0 text-[#00d992]" />
          <input
            type="text"
            value={title}
            onChange={(e) => updateAttributes({ title: e.target.value })}
            aria-label="Terminal title"
            className="min-w-0 w-36 sm:w-44 bg-transparent font-mono text-xs font-medium text-[#cbe5dc] focus:outline-none focus:text-white"
          />
        </div>

        <div className="flex items-center gap-1">
          <select
            aria-label="Shell preset"
            value={shell}
            onChange={(e) => handleShellChange(e.target.value as ShellFlavor)}
            className="rounded-md border border-[#223442] bg-[#091119] px-2 py-0.5 font-mono text-[11px] text-[#8fb8aa] focus:border-[#00d992] focus:outline-none cursor-pointer"
          >
            <option value="bash">bash</option>
            <option value="zsh">zsh</option>
            <option value="kali">kali</option>
            <option value="pwsh">pwsh</option>
          </select>

          <button
            type="button"
            onClick={() => setCustomOpen((prev) => !prev)}
            title="Add custom command & output snippet"
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 font-mono text-[11px] transition-colors cursor-pointer ${
              customOpen
                ? 'bg-[#00d992]/15 text-[#00d992]'
                : 'text-[#8fb8aa] hover:bg-white/5 hover:text-white'
            }`}
          >
            <Plus className="h-3 w-3" />
            <span className="hidden sm:inline">Snippet</span>
          </button>

          <button
            type="button"
            onClick={handleCopyAll}
            title="Copy transcript"
            className="rounded-md p-1 text-[#8fb8aa] hover:bg-white/5 hover:text-white cursor-pointer"
          >
            {copiedAll ? (
              <Check className="h-3.5 w-3.5 text-[#00d992]" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>

          {entries.length > 0 && (
            <button
              type="button"
              onClick={() => updateAttributes({ entries: [] })}
              title="Clear terminal output"
              className="rounded-md p-1 text-[#8fb8aa] hover:bg-white/5 hover:text-white cursor-pointer"
            >
              <Eraser className="h-3.5 w-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={deleteNode}
            title="Remove terminal block"
            className="rounded-md p-1 text-[#8fb8aa] hover:bg-red-500/15 hover:text-red-400 cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Optional Custom Command + Output Composer */}
      {customOpen && (
        <form
          contentEditable={false}
          onSubmit={handleAddCustomSnippet}
          className="space-y-2 border-b border-[#182530] bg-[#0a1118] p-3 font-mono text-xs"
        >
          <input
            type="text"
            value={customCmd}
            onChange={(e) => setCustomCmd(e.target.value)}
            placeholder="Command (e.g. nmap -sV 10.0.0.1)"
            className="w-full rounded-md border border-[#223442] bg-[#060b10] px-2.5 py-1.5 text-xs text-[#e6fff5] placeholder:text-[#4e7066] focus:border-[#00d992] focus:outline-none"
          />
          <textarea
            value={customOut}
            onChange={(e) => setCustomOut(e.target.value)}
            rows={3}
            placeholder="Paste or type expected terminal output..."
            className="w-full rounded-md border border-[#223442] bg-[#060b10] px-2.5 py-1.5 text-xs text-[#a9d8c7] placeholder:text-[#4e7066] focus:border-[#00d992] focus:outline-none"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCustomOpen(false)}
              className="rounded-md px-2.5 py-1 text-[11px] text-[#8fb8aa] hover:bg-white/5 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md bg-[#00d992] px-3 py-1 text-[11px] font-semibold text-[#041810] hover:bg-[#2bf0ae] cursor-pointer"
            >
              Append to Terminal
            </button>
          </div>
        </form>
      )}

      {/* Transcript + Live Prompt */}
      <div
        contentEditable={false}
        onClick={() => {
          if (!editingEntryId) inputRef.current?.focus();
        }}
        className="max-h-96 overflow-y-auto px-4 py-3.5 font-mono text-[12.5px] leading-relaxed space-y-2.5"
      >
        {entries.length === 0 && (
          <div className="text-[11.5px] text-[#5c8276]">
            Interactive terminal simulator ready. Type <span className="text-[#00d992]">help</span>,{' '}
            <span className="text-[#00d992]">ip a</span>, <span className="text-[#00d992]">ping 1.1.1.1</span>,{' '}
            or <span className="text-[#00d992]">nmap</span> below and press Enter.
          </div>
        )}

        {entries.map((entry) => {
          const isEditing = editingEntryId === entry.id;
          return (
            <div key={entry.id} className="group/entry space-y-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1 break-all">
                  <span className="mr-2 select-none font-semibold text-[#00d992]">{prompt}</span>
                  {isEditing ? (
                    <input
                      type="text"
                      value={entry.command}
                      onChange={(e) => handleUpdateEntry(entry.id, { command: e.target.value })}
                      className="w-[calc(100%-10rem)] rounded border border-[#223442] bg-[#0c151e] px-1.5 py-0.5 text-[#f0fff9] focus:border-[#00d992] focus:outline-none"
                    />
                  ) : (
                    <span className="text-[#f0fff9]">{entry.command}</span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1 opacity-80 sm:opacity-0 sm:group-hover/entry:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingEntryId(isEditing ? null : entry.id);
                    }}
                    title={isEditing ? 'Done editing' : 'Edit command / output'}
                    className="rounded p-1 text-[#7ea698] hover:bg-white/5 hover:text-[#00d992] cursor-pointer"
                  >
                    {isEditing ? <Check className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopyEntry(entry);
                    }}
                    title="Copy command"
                    className="rounded p-1 text-[#7ea698] hover:bg-white/5 hover:text-white cursor-pointer"
                  >
                    {copiedId === entry.id ? (
                      <Check className="h-3 w-3 text-[#00d992]" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveEntry(entry.id);
                    }}
                    title="Remove entry"
                    className="rounded p-1 text-[#7ea698] hover:bg-red-500/15 hover:text-red-400 cursor-pointer"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>

              {isEditing ? (
                <textarea
                  value={entry.output}
                  onChange={(e) => handleUpdateEntry(entry.id, { output: e.target.value })}
                  rows={Math.min(10, Math.max(2, entry.output.split('\n').length))}
                  placeholder="Command output..."
                  className="w-full rounded-md border border-[#223442] bg-[#0c151e] p-2 text-[12px] text-[#9bd1be] focus:border-[#00d992] focus:outline-none"
                />
              ) : (
                entry.output && (
                  <pre className="!m-0 !border-0 !bg-transparent !p-0 whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-[#9bd1be]">
                    {entry.output}
                  </pre>
                )
              )}
            </div>
          );
        })}

        {/* Active Command Input */}
        <form onSubmit={handleRunCommand} className="flex items-center gap-2 pt-0.5">
          <span className="shrink-0 select-none font-semibold text-[#00d992]">{prompt}</span>
          <div className="relative flex min-w-0 flex-1 items-center">
            <input
              ref={inputRef}
              type="text"
              value={cmdInput}
              onChange={(e) => setCmdInput(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="Enter command..."
              className="w-full bg-transparent text-[#f0fff9] placeholder:text-[#44675c] focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={!cmdInput.trim()}
            title="Run simulated command"
            className="inline-flex shrink-0 items-center gap-0.5 rounded bg-[#00d992]/15 px-2 py-0.5 text-[11px] font-medium text-[#00d992] hover:bg-[#00d992]/25 disabled:opacity-35 cursor-pointer"
          >
            Run
            <ChevronRight className="h-3 w-3" />
          </button>
        </form>
      </div>
    </NodeViewWrapper>
  );
}

export const TerminalNode = Node.create({
  name: 'terminalBlock',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      shell: { default: 'bash' },
      prompt: { default: 'user@vellum:~$' },
      title: { default: 'Terminal Simulator' },
      entries: { default: [] },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="terminalBlock"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'terminalBlock' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TerminalBlockView, {
      stopEvent: ({ event }) => {
        const target = event.target as HTMLElement | null;
        if (!target) return false;
        const tag = target.tagName;
        return (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          tag === 'BUTTON' ||
          Boolean(target.closest('form, button, input, textarea, select'))
        );
      },
      ignoreMutation: () => true,
    });
  },
});
