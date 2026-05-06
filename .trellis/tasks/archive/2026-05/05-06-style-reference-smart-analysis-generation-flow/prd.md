# style-reference-smart-analysis-generation-flow

## Goal

让风格参考图上传后的体验更智能：参考图更新后自动提炼简短风格标签和描述展示给用户；生成图片时不再临时请求大模型生成图片提示词，而是基于参考图数量和用户个性化需求拼接预设提示词；同时仍向大模型获取本次任务标题。

## Requirements

* 用户上传或更新风格参考图后，将参考图发送给大模型分析，提炼简短风格 tag 和简述并展示在页面。
* 风格分析内容保持简短，覆盖场景、打光、配色等关键信息，不生成过长文本。
* 将“描述你想要的头像风格”卡片改为“个性化定制”，允许用户自行补充需求。
* 去除用户输入区域的 tag 自动填充功能。
* 用户点击开始生成时，根据参考图数量使用预设 prompt 拼接图片生成提示词：
  * 只有一张参考图：强调完全还原参考图风格与构图，主要做脸部替换。
  * 多张参考图：第一张为主图，其余为风格参考；以主图做场景还原，并吸收其他参考图风格。
* 图片生成流程不再向大模型交互获取图片生成提示词。
* 当用户有个性化输入时，图片生成提示中必须注明用户提示词优先级最高，并拼接用户需求。
* 向大模型获取本次任务标题，输入应包含风格参考图分析信息和用户要求。
* 完成后运行可行验证并自动提交。

## Acceptance Criteria

* [ ] 上传或替换风格参考图后，页面自动展示简短风格 tag 和描述。
* [ ] 个性化定制卡片标题更新，且不存在 tag 自动填充入口/逻辑。
* [ ] 生成图片时使用本地预设 prompt 分支，不再调用大模型生成图片提示词。
* [ ] 1 张与多张参考图分别使用符合要求的生成提示词。
* [ ] 用户输入存在时，生成提示词明确用户需求优先级最高。
* [ ] 任务标题仍由大模型生成，并包含风格分析与用户要求上下文。
* [ ] Lint/typecheck/build 或项目既有验证通过。

## Definition of Done

* 变更尽量保持手术式，匹配现有代码风格。
* UI 与服务端数据流保持一致。
* 相关验证命令通过；如无法运行 UI 验证需说明原因。
* Git 工作区仅包含本任务相关修改并创建新提交。

## Out of Scope

* 更换图片生成模型或供应商。
* 新增复杂风格编辑器、历史管理或多轮对话式 prompt 优化。
* 改造与本流程无关的页面或组件。

## Technical Notes

* Frontend generation UI lives primarily in `apps/web/src/pages/GeneratePage.tsx`.
* Upload layout is handled by `apps/web/src/components/UploadCard.tsx`.
* Frontend API wrappers live in `apps/web/src/lib/api.ts`.
* Backend generation/task/model flow lives primarily in `apps/api/src/index.ts`.
* Existing generation-time prompt enhancement uses `generateEnhancedOpenAiPrompt` / `buildPromptAnalysisMessage`; this task should remove that interaction from the image generation path and replace it with local preset prompt construction.
* Existing task title/summary model interaction uses `createTaskSummary`; this behavior should remain, with style analysis and user requirements included in its context.
