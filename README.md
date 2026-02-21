# ClawCorp: Self-Evolving AI Organization

**Version:** 0.3.0 (Self-Improving & Dynamic HR)
**Date:** 2026-02-21
**Author:** Chairman (User) & CTO (OpenClaw)

---

## 1. Vision (愿景)

**ClawCorp** 是一家 **"Virtual Software & Research Organization"** (虚拟产研机构)。
最核心的理念是 **Self-Evolving (自进化)**。

**Core Philosophy:**
1.  **Dynamic HR (动态人事):** 公司没有固定的员工列表。你需要什么人，我们就 **"Hire" (招聘)** 什么人。不需要了，就 **"Fire" (解雇/归档)**。
2.  **Role-Based (基于角色):** 就像 Jira/Trello，Agent 没有名字，只有 **职位 (Role)**。你是与 **Product Manager** 或 **Principal Investigator** 对话。
3.  **File-Based State (文件即状态):** 公司的所有记忆、任务、产物都存储在透明的文件系统中。Git 是我们的时光机。
4.  **Scientific Method (科学方法):** 引入 **Research Lab**，不仅做工程，还做假设验证 (Hypothesis Testing)。

---

## 2. Dynamic Organization (动态组织架构)

ClawCorp 的架构是 **弹性** 的。只要在 `agents/` 目录下创建一个文件夹，就等于 **招聘** 了一名新员工。

### A. Core Team (创始团队 - Starting Lineup)

虽然是动态的，但为了开张，我们需要这 7 位核心成员：

| 部门 (Dept) | 职位 (Role) | 代号 (ID) | 职责 (Responsibility) | 驱动 (Driver) |
| :--- | :--- | :--- | :--- | :--- |
| **Product** | **Product Manager** | `product-manager` | 需求分析、PRD、任务拆解 | Claude 3.5 Sonnet |
| | **Architect** | `architect` | 技术选型、API 定义 | Claude 3 Opus |
| **Engineering** | **Senior Engineer** | `senior-engineer` | 核心代码、Refactor | **Claude Code CLI** |
| | **QA Engineer** | `qa-engineer` | 测试、验收 | Script Runner |
| | **Intern (Ops)** | `intern` | 打杂、脚本、日志 | **OpenCode CLI** |
| **Research Lab** | **Principal Investigator** | `principal-investigator` | 提出假设、文献综述 | **OpenClaw Main** |
| | **Research Assistant** | `research-assistant` | 跑实验、画图、写论文 | Python Kernel |

### B. Hiring Mechanism (招聘机制)
当你对 CEO 说 *"我们需要一个专门写 SQL 的 DBA"* 时：
1.  **System Action:** `mkdir agents/database-admin`
2.  **Profile Generation:** 自动生成 `profile.json` (写好 SQL 专精的 Prompt)。
3.  **Onboarding:** 生成空的 `memory.md`。
4.  **Result:** Dashboard 上立刻多出一个 "DBA" 图标。

### C. Firing Mechanism (解雇机制)
当你觉得某个 Agent 没用了：
1.  **System Action:** `mv agents/bad-role archive/`
2.  **Result:** 它从看板上消失，但历史记录保留。

---

## 3. Workflow (看板工作流)

任务在 **Jira-style Board** 上流转：

### Track 1: Software Engineering (软件开发)
1.  **Backlog:** 用户提出 Idea。
2.  **Analysis (PM):** `product-manager` 生成 PRD。
3.  **Design (Arch):** `architect` 审核并出方案。
4.  **Development (Dev):** `senior-engineer` 写代码。
5.  **Testing (QA):** `qa-engineer` 跑测试。
6.  **Done:** 交付。

### Track 2: Scientific Research (科研探索)
1.  **Hypothesis:** 用户提出一个科学问题 (e.g., "Agent Memory decay rate?").
2.  **Review (PI):** `principal-investigator` 搜索文献，写综述。
3.  **Experiment (RA):** `research-assistant` 写代码跑实验，画图。
4.  **Analysis (PI):** PI 分析实验结果，验证假设。
5.  **Paper (PI+RA):** 联合撰写报告/论文。

---

## 4. System Architecture (系统实现)

### Tech Stack
*   **Frontend:** Next.js 15 (App Router), Tailwind CSS, **React Kanban** (拖拽看板)。
*   **Backend:** Next.js Server Actions (Node.js)。
*   **Database:** Local JSON Files (`missions/`, `agents/`).
*   **Process:** Node.js `execa` (调用 CLI)。

### Directory Structure (物理架构)

```text
~/research/ClawCorp/
├── agents/             # 动态人事库 (Dynamic HR DB)
│   ├── product-manager/
│   │   ├── profile.json  # 岗位职责 (System Prompt)
│   │   └── memory.md     # 长期记忆 (偏好、历史教训)
│   ├── senior-engineer/
│   └── database-admin/   # (新招聘的员工)
├── missions/           # 任务数据库 (Jira Issues)
│   └── M-101/          # 具体任务
│       ├── state.json  # 任务状态机
│       ├── kanban.json # 看板状态
│       └── artifacts/  # 产出物
└── src/                # Dashboard 源码
```

---

## 5. Protocols (核心协议)

### `agents/{role}/profile.json`
```json
{
  "id": "senior-engineer",
  "title": "Senior Software Engineer",
  "department": "Engineering",
  "description": "Expert in Python/Rust/TypeScript. Focus on code quality and architecture.",
  "driver": {
    "type": "cli",
    "command": "claude",
    "args": ["-p"]
  },
  "cost_model": "high"
}
```

### `missions/{id}/state.json`
```json
{
  "id": "M-101",
  "title": "Research MCP SDK",
  "type": "research", // or "engineering"
  "status": "in_progress",
  "current_stage": "experiment",
  "assignee": "research-assistant",
  "history": [...]
}
```

---

## 6. Roadmap (实施计划)

*   **Phase 1: Foundation** (Done)
    *   Project Init, Design Spec (v0.3.0).
*   **Phase 2: Hiring (Current)**
    *   Create `agents/` directories.
    *   Generate `profile.json` for initial 7 roles.
*   **Phase 3: The Board (UI)**
    *   Implement Kanban Board in Next.js.
*   **Phase 4: The Brain (Orchestrator)**
    *   Implement Task Dispatcher & Dynamic Hiring Logic.

