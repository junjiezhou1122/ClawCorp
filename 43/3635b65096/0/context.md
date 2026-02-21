# Session Context

## User Prompts

### Prompt 1

first see the readme.md file and then let's think faster!

### Prompt 2

I think we can re build it, let's first rethink about this project! And think about what language or framework should we use to build this project

### Prompt 3

why not recommend other language like rust or go to build backend??

### Prompt 4

Do u think next.js is also a good choice?

### Prompt 5

Now, think again deeply and give me some advice, Maybe in the future i will run many agents simlutanously! it must be quickly for this

### Prompt 6

But go is not good for some ai tools, typescript sometimes is better, like claude code or other tools they all use typescript!

### Prompt 7

Then what's the strength of Go

### Prompt 8

So I think hono and bun has not big difference between next.js

### Prompt 9

So I wanna change let's use the bun+hono + react + vite, delete all my code now, let's rebuild it!

### Prompt 10

下面先帮我git commit 一个版本 我刚刚还遇到点问题！

### Prompt 11

现在来说一下我们的项目的目前的结构 以及之后的规划！

### Prompt 12

先做一个最小的可用版本！

### Prompt 13

(base) junjie@JunjiedeMacBook-Air ClawCorp % bun run dev:server
$ cd server && bun install && bun run dev
bun install v1.3.9 (cf6cdbbb)

Checked 6 installs across 7 packages (no changes) [15.00ms]
$ bun run --watch src/index.ts
15 | app.route('/api/missions', missionRoutes)
16 | app.route('/api/run', runRoutes)
17 | 
18 | app.get('/health', (c) => c.json({ status: 'ok', time: new Date().toISOString() }))
19 | 
20 | const server = Bun.serve({
                        ^
error: Failed to start serve...

### Prompt 14

there are no agent can choose!

### Prompt 15

[research-assistant] ▶ Agent started
[research-assistant] ▶ Agent started
  File "<string>", line 1
    brainstorming how to learn(metalearning)
                  ^^^
SyntaxError: invalid syntax
  File "<string>", line 1
    brainstorming how to learn(metalearning)
                  ^^^
SyntaxError: invalid syntax
[research-assistant] ■ Agent done (exit 1)
[research-assistant] ■ Agent done (exit 1) 啥意思！ 我们先用opencode！

### Prompt 16

[research-assistant] ▶ Agent started
Error: Failed to change directory to /Users/junjie/research/ClawCorp/server/brainstorming how to learn(metalearning)
[research-assistant] ■ Agent done (exit 0)

### Prompt 17

成功了 但这里有一个问题 就是我没办法管理我的workspace 和 具体做事的文件夹 这都是需要的！ 不同的agent有自己的workspace！ 然后也要知道在哪个文件夹询问 像opencode这种对于项目的感知也很重要！ 还有就是如何恢复某一个对话（这包含一定的上下文） 等等都是很重要哒！

