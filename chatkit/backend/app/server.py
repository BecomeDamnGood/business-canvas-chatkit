from __future__ import annotations

from pathlib import Path
from typing import Any, AsyncIterator

from agents import Agent
from chatkit.agents import AgentContext
from chatkit.server import ChatKitServer, stream_widget
from chatkit.types import Action, ThreadMetadata, ThreadStreamEvent, UserMessageItem, WidgetItem
from chatkit.widgets import WidgetTemplate

from .memory_store import MemoryStore

MODEL = "gpt-4.1-mini"

assistant_agent = Agent[AgentContext[dict[str, Any]]](
    model=MODEL,
    name="Starter Assistant",
    instructions=(
        "You are a concise, helpful assistant. "
        "Keep replies short and focus on directly answering the user's request."
    ),
)

BC_STEPS: list[dict[str, Any]] = [
    {"name": "Dream", "message": "What is your dream for this business in 3 years?", "choices": []},
    {"name": "Purpose", "message": "Why does this business exist? What is the larger purpose?", "choices": []},
    {"name": "Audience", "message": "Who is it for? Who is your ideal customer or audience?", "choices": ["B2B", "B2C", "Both"]},
    {"name": "Problem", "message": "What problem do you solve (in your customer's words)?", "choices": []},
    {"name": "Value", "message": "What is your value proposition in 1 sentence + 2 bullets?", "choices": []},
    {"name": "Channels", "message": "Which channels reach customers (top 3)?", "choices": ["Online", "Offline", "Partnerships"]},
    {"name": "Revenue", "message": "How do you make money (pricing / revenue model)?", "choices": []},
    {"name": "Costs", "message": "What are your main costs and risks?", "choices": []},
    {"name": "Next actions", "message": "What are 3 concrete actions for the next 2 weeks?", "choices": []},
]


class StarterChatServer(ChatKitServer[dict[str, Any]]):
    def __init__(self) -> None:
        self.store: MemoryStore = MemoryStore()
        super().__init__(self.store)

        self._bc_state: dict[str, dict[str, Any]] = {}

        backend_dir = Path(__file__).resolve().parent.parent
        widgets_dir = backend_dir / "widgets"
        self._intro_tpl = WidgetTemplate.from_file(str(widgets_dir / "Business Canvas Builder Intro.widget"))
        self._steps_tpl = WidgetTemplate.from_file(str(widgets_dir / "Business Canvas Steps.widget"))

    def _build_intro_widget(self) -> Any:
        return self._intro_tpl.build({})

    def _build_steps_widget(
        self,
        *,
        step_index_1based: int,
        step_total: int,
        step_name: str,
        agent_message: str,
        choices: list[str],
    ) -> Any:
        c1 = choices[0] if len(choices) > 0 else ""
        c2 = choices[1] if len(choices) > 1 else ""
        c3 = choices[2] if len(choices) > 2 else ""
        return self._steps_tpl.build(
            {
                "stepIndex": step_index_1based,
                "stepTotal": step_total,
                "stepName": step_name,
                "agentMessage": agent_message,
                "choice1": c1,
                "choice2": c2,
                "choice3": c3,
            }
        )

    def _get_or_init_state(self, thread_id: str) -> dict[str, Any]:
        st = self._bc_state.get(thread_id)
        if st is None:
            st = {"current_step": -1, "answers": {}, "step_total": len(BC_STEPS)}
            self._bc_state[thread_id] = st
        return st

    def _advance(self, thread_id: str, answer_text: str) -> dict[str, Any]:
        st = self._get_or_init_state(thread_id)

        if st["current_step"] == -1:
            st["answers"]["company"] = answer_text.strip()
            st["current_step"] = 0
        else:
            idx = int(st["current_step"])
            step_name = BC_STEPS[idx]["name"]
            st["answers"][step_name] = answer_text.strip()
            st["current_step"] = min(idx + 1, len(BC_STEPS) - 1)

        idx = int(st["current_step"])
        step = BC_STEPS[idx]
        return {
            "stepIndex": idx + 1,
            "stepTotal": st["step_total"],
            "stepName": step["name"],
            "agentMessage": step["message"],
            "choices": step.get("choices", []),
        }

    async def respond(
        self,
        thread: ThreadMetadata,
        item: UserMessageItem | None,
        context: dict[str, Any],
    ) -> AsyncIterator[ThreadStreamEvent]:
        st = self._get_or_init_state(thread.id)
        if st["current_step"] == -1:
            intro = self._build_intro_widget()
            async for ev in stream_widget(thread, intro):
                yield ev
            return

        idx = int(st["current_step"])
        step = BC_STEPS[idx]
        widget = self._build_steps_widget(
            step_index_1based=idx + 1,
            step_total=int(st.get("step_total", len(BC_STEPS))),
            step_name=str(step["name"]),
            agent_message=str(step["message"]),
            choices=list(step.get("choices", [])),
        )
        async for ev in stream_widget(thread, widget):
            yield ev
        return

    def action(
        self,
        thread: ThreadMetadata,
        action: Action[str, Any],
        sender: WidgetItem | None,
        context: dict[str, Any],
    ) -> AsyncIterator[ThreadStreamEvent]:
        async def _impl() -> AsyncIterator[ThreadStreamEvent]:
            action_type = action.type
            payload = action.payload or {}

            if action_type == "bc.intro.submit":
                answer = str(payload.get("answer", "") or "").strip()
                data = self._advance(thread.id, answer)
                widget = self._build_steps_widget(
                    step_index_1based=int(data["stepIndex"]),
                    step_total=int(data["stepTotal"]),
                    step_name=str(data["stepName"]),
                    agent_message=str(data["agentMessage"]),
                    choices=list(data["choices"]),
                )
                async for ev in stream_widget(thread, widget):
                    yield ev
                return

            if action_type == "bc.step.submit":
                answer = str(payload.get("answer", "") or "").strip()
                data = self._advance(thread.id, answer)
                widget = self._build_steps_widget(
                    step_index_1based=int(data["stepIndex"]),
                    step_total=int(data["stepTotal"]),
                    step_name=str(data["stepName"]),
                    agent_message=str(data["agentMessage"]),
                    choices=list(data["choices"]),
                )
                async for ev in stream_widget(thread, widget):
                    yield ev
                return

            if action_type == "bc.step.choice":
                answer = str(payload.get("label", "") or "").strip()
                if not answer:
                    return
                data = self._advance(thread.id, answer)
                widget = self._build_steps_widget(
                    step_index_1based=int(data["stepIndex"]),
                    step_total=int(data["stepTotal"]),
                    step_name=str(data["stepName"]),
                    agent_message=str(data["agentMessage"]),
                    choices=list(data["choices"]),
                )
                async for ev in stream_widget(thread, widget):
                    yield ev
                return

            return

        return _impl()
