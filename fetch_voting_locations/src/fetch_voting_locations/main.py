import typer
from fetch_voting_locations.fetch_early_voting_locations import fetch_early_voting_locations, main

app = typer.Typer()


@app.command()
def fetch(election_id: str = typer.Argument('a0pcs00000J6e6HAA', help="The election ID"),
          scenarios_file_path: str = 'scenarios.json',
          state='Georgia',
          output_directory: str = 'data'
          ):
    """
    Fetch early voting locations for a specific election
    """
    main(election_id=election_id, scenarios_file_path=scenarios_file_path, state=state,
         output_directory=output_directory)


if __name__ == '__main__':
    app()
