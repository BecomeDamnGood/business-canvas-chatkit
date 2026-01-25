"""ChatKit server that streams responses from a single assistant + handles Business Canvas widget actions."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, AsyncIterator

from agents import Runner
from agents import Agent
from chatkit.agents import AgentContext, simple_to_agent_input, stream_agent_response
from chatkit.server import ChatKitServer, stream_widget
from chatkit.types import (
    Action,
    ThreadMetadata,
    ThreadStreamEvent,
    UserMessageItem,
    WidgetItem,
)
from chatkit.widgets import WidgetTemplate

from .memory_store import MemoryStore

MAX_RECENT_ITEMS = 30
MODEL = "gpt-4.1-mini"

# --- Default assistant (kept from starter) ---
assistant_agent = Agent[AgentContext[dict[str, Any]]](
    model=MODEL,
    name="Starter Assistant",
    instructions=(
        "You are a concise, helpful assistant. "
        "Keep replies short and focus on directly answering "
        "the user's request."
    ),
)

# --- Business Canvas: lightweight step spec (placeholder until your agent engine is plugged in) ---
BC_STEPS: list[dict[str, Any]] = [
    {
        "name": "Dream",
        "message": "Wat is jouw droom voor dit bedrijf over 3 jaar? (max 3 zinnen)",
        "choices": [],
    },
    {
        "name": "Purpose",
        "message": "Waarom bestaat dit bedrijf? Wat is het grotere doel (purpose)?",
        "choices": [],
    },
    {
        "name": "Audience",
        "message": "Voor wie is het? Wie is je ideale klant/doelgroep?",
        "choices": ["B2B", "B2C", "Beide"],
    },
    {
        "name": "Problem",
        "message": "Welk probleem los je op (in de woorden van je klant)?",
        "choices": [],
    },
    {
        "name": "Value",
        "message": "Wat is je value proposition in 1 zin + 2 bullets?",
        "choices": [],
    },
    {
        "name": "Channels",
        "message": "Via welke kanalen bereik je klanten (top 3)?",
        "choices": ["Online", "Offline", "Partnerships"],
    },
    {
        "name": "Revenue",
        "message": "Hoe verdien je geld (pricing / revenue model)?",
        "choices": [],
    },
    {
        "name": "Costs",
        "message": "Wat zijn je belangrijkste kostenposten en risico’s?",
        "choices": [],
    },
    {
        "name": "Next actions",
        "message": "Wat zijn 3 concrete acties voor de komende 2 weken?",
        "choices": [],
    },
]


class StarterChatServer(ChatKitServer[dict[str, Any]]):
    """Server implementation that keeps conversation state in memory and handles widget actions."""

    def __init__(self) -> None:
        self.store: MemoryStore = MemoryStore()
        super().__init__(self.store)

        # In-memory per-thread Business Canvas state (good enough for testing).
        # Later you can persist this in your store.
        self._bc_state: dict[str, dict[str, Any]] = {}

        # Load widget templates (.widget files) from chatkit/backend/widgets/
        backend_dir = Path(__file__).resolve().parent.parent  # .../chatkit/backend
        widgets_dir = backend_dir / "widgets"
        self._intro_tpl = WidgetTemplate.from_file(str(widgets_dir / "Business Canvas Builder Intro.widget"))
        self._steps_tpl = WidgetTemplate.from_file(str(widgets_dir / "Business Canvas Steps.widget"))

    # ----------------------------
    # Helpers: build widget roots
    # ----------------------------
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
            st = {
                "current_step": -1,  # -1 means "intro not completed"
                "answers": {},
                "step_total": len(BC_STEPS),
            }
            self._bc_state[thread_id] = st
        return st

    def _advance(self, thread_id: str, answer_text: str) -> dict[str, Any]:
        """
        Advance the canvas by one step and return render data for the Steps widget.
        This is the place to swap in your real agent-orchestrator later.
        """
        st = self._get_or_init_state(thread_id)

        # If we're on intro, store it as "company" and go to step 0.
        if st["current_step"] == -1:
            st["answers"]["company"] = answer_text.strip()
            st["current_step"] = 0
        else:
            # Save answer for current step, then move forward
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

    # ----------------------------
    # Normal chat (kept)
    # ----------------------------
    async def respond(
        self,
        thread: ThreadMetadata,
        item: UserMessageItem | None,
        context: dict[str, Any],
    ) -> AsyncIterator[ThreadStreamEvent]:
        # If someone starts chatting normally, we can show the intro widget once.
        # (Your main flow is via widget actions, not chat input.)
        st = self._get_or_init_state(thread.id)
        if st["current_step"] == -1:
            intro = self._build_intro_widget()
            async for ev in stream_widget(thread, intro):
                yield ev
            return

        # Otherwise fall back to starter assistant response
        items_page = await self.store.load_thread_items(
            thread.id,
            after=None,
            limit=MAX_RECENT_ITEMS,
            order="desc",
            context=context,
        )
        items = list(reversed(items_page.data))
        agent_input = await simple_to_agent_input(items)

        agent_context = AgentContext(
            thread=thread,
            store=self.store,
            request_context=context,
        )

        result = Runner.run_streamed(
            assistant_agent,
            agent_input,
            context=agent_context,
        )

        async for event in stream_agent_response(agent_context, result):
            yield event

    # ----------------------------
    # Widget Actions (THIS is the functional glue)
    # ----------------------------
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

            # 1) Intro submit (first answer)
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

            # 2) Step textarea submit
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

            # 3) Step choice click (button label is the answer)
            if action_type == "bc.step.choice":
                answer = str(payload.get("label", "") or "").strip()
                if not answer:
                    # If empty (disabled button), do nothing.
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

            # Unknown action: ignore (or you can yield a small assistant message)
            return

        return _impl()
