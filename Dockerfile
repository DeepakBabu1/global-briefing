FROM apache/airflow:2.7.2-python3.11

# Install additional dependencies
USER root
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Python packages as airflow user
COPY requirements.txt /requirements.txt
USER airflow
RUN pip install --user --no-cache-dir -r /requirements.txt

# Copy DAG files
COPY dags/ /opt/airflow/dags/
COPY include/ /opt/airflow/include/
