import useJobs from './useJobs';

const useJob = (jobId) => {
  const { jobs, loading, error } = useJobs();

  const job = jobs.find((item) => String(item.id) === String(jobId)) || null;

  return { job, loading, error };
};

export default useJob;
